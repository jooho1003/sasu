import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sessionRpc: vi.fn(),
  serviceRpc: vi.fn(),
  getUser: vi.fn(),
  writesEnabled: vi.fn(),
  notionWhoAmI: vi.fn(),
  runWithNotionAuth: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    rpc: mocks.sessionRpc,
    auth: { getUser: mocks.getUser },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.serviceRpc }),
}));
vi.mock("@/lib/features", () => ({
  orgAdminReadEnabled: () => true,
  orgAdminWritesEnabled: mocks.writesEnabled,
}));
vi.mock("@/lib/site", () => ({
  metadataBase: () => new URL("https://sasu.example"),
}));
vi.mock("@/lib/notion", () => ({
  notionWhoAmI: mocks.notionWhoAmI,
  runWithNotionAuth: mocks.runWithNotionAuth,
}));

import {
  DELETE,
  GET,
  POST,
} from "@/app/api/admin/notion/route";
import { decryptNotionToken } from "@/lib/notion-installation";

const actor = "11111111-1111-4111-8111-111111111111";
const org = "22222222-2222-4222-8222-222222222222";

function request(
  method: "POST" | "DELETE",
  body?: unknown,
  origin = "https://sasu.example",
) {
  return new Request("https://sasu.example/api/admin/notion", {
    method,
    headers: {
      origin,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("Notion installation HTTP boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv(
      "NOTION_TOKEN_ENCRYPTION_KEY",
      Buffer.alloc(32, 47).toString("base64"),
    );
    mocks.writesEnabled.mockReturnValue(true);
    mocks.getUser.mockResolvedValue({
      data: { user: { id: actor } },
      error: null,
    });
    mocks.sessionRpc.mockResolvedValue({ data: org, error: null });
    mocks.serviceRpc.mockResolvedValue({ data: true, error: null });
    mocks.notionWhoAmI.mockResolvedValue({
      botId: "bot-a",
      workspaceId: null,
      workspaceName: "QA workspace",
    });
    mocks.runWithNotionAuth.mockImplementation(
      async (_auth: { token: string }, action: () => Promise<unknown>) =>
        action(),
    );
  });

  it("rejects foreign origins and a missing permission attestation before validation", async () => {
    expect(
      (
        await POST(
          request(
            "POST",
            { token: "ntn_secret", attested: true },
            "https://foreign.example",
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await POST(
          request("POST", { token: "ntn_secret", attested: false }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.notionWhoAmI).not.toHaveBeenCalled();
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });

  it("validates the token, derives authority from the session, and stores only ciphertext", async () => {
    const response = await POST(
      request("POST", { token: "ntn_sensitive-token", attested: true }),
    );

    expect(response.status).toBe(200);
    expect(mocks.runWithNotionAuth).toHaveBeenCalledWith(
      { token: "ntn_sensitive-token" },
      mocks.notionWhoAmI,
    );
    expect(mocks.sessionRpc).toHaveBeenCalledWith("admin_org_id");
    const [name, args] = mocks.serviceRpc.mock.calls[0];
    expect(name).toBe("complete_notion_installation");
    expect(args).toMatchObject({
      p_actor: actor,
      p_org: org,
      p_workspace: "bot:bot-a",
      p_name: "QA workspace",
      p_bot: "bot-a",
      p_kind: "internal_token",
    });
    expect(JSON.stringify(args)).not.toContain("ntn_sensitive-token");
    expect(
      decryptNotionToken(args.p_encrypted, org, "bot:bot-a"),
    ).toBe("ntn_sensitive-token");
    expect(await response.text()).not.toContain("ntn_sensitive-token");
  });

  it("rejects demo organizations before validating the external token", async () => {
    mocks.sessionRpc.mockImplementation(async (name: string) =>
      name === "admin_org_id"
        ? { data: org, error: null }
        : { data: null, error: { code: "42501", message: "forbidden" } },
    );

    const response = await POST(
      request("POST", { token: "ntn_sensitive-token", attested: true }),
    );

    expect(response.status).toBe(403);
    expect(mocks.notionWhoAmI).not.toHaveBeenCalled();
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });

  it("reads metadata and revokes through the session client only", async () => {
    mocks.sessionRpc
      .mockResolvedValueOnce({
        data: {
          workspace_name: "QA",
          active: true,
          installed_at: "2026-09-18T00:00:00Z",
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });

    const getResponse = await GET();
    const deleteResponse = await DELETE(request("DELETE"));

    expect(getResponse.status).toBe(200);
    expect(await getResponse.text()).not.toContain("encrypted");
    expect(deleteResponse.status).toBe(200);
    expect(mocks.sessionRpc.mock.calls).toEqual([
      ["admin_notion_installation"],
      ["revoke_notion_installation"],
    ]);
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });
});
