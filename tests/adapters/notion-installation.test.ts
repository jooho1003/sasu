import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

import { saveNotionInstallation } from "@/lib/adapters/notion-installation";

const installation = {
  actorId: "actor",
  orgId: "org",
  workspaceId: "workspace",
  workspaceName: "Workspace",
  botId: "bot",
  encryptedToken: "v1.synthetic",
};

describe("Notion credential collection adapter", () => {
  beforeEach(() => vi.resetAllMocks());

  it("passes only verified encrypted installation fields to the service RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    await expect(saveNotionInstallation(installation)).resolves.toBe("saved");
    expect(mocks.rpc).toHaveBeenCalledWith("complete_notion_installation", {
      p_actor: "actor",
      p_org: "org",
      p_workspace: "workspace",
      p_name: "Workspace",
      p_bot: "bot",
      p_kind: "internal_token",
      p_encrypted: "v1.synthetic",
    });
  });

  it("maps database details to fixed adapter outcomes", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "23505", message: "private detail" },
    });
    await expect(saveNotionInstallation(installation)).resolves.toBe(
      "workspace_conflict",
    );

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "XX000", message: "private detail" },
    });
    await expect(saveNotionInstallation(installation)).resolves.toBe("failed");
  });
});
