import { afterEach, describe, expect, it, vi } from "vitest";

import { listDataSources } from "@/lib/notion";
import { encryptNotionToken } from "@/lib/notion-installation";
import { withNotionForDepartment } from "@/lib/notion-workspace";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Notion workspace lookup", () => {
  it("uses only the installation returned for the requested department", async () => {
    vi.stubEnv(
      "NOTION_TOKEN_ENCRYPTION_KEY",
      Buffer.alloc(32, 29).toString("base64"),
    );
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          org_id: "org-a",
          workspace_id: "workspace-a",
          encrypted_token: encryptNotionToken(
            "token-a",
            "org-a",
            "workspace-a",
          ),
        },
        error: null,
      }),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        expect(init.headers).toMatchObject({ Authorization: "Bearer token-a" });
        return Response.json({ data_sources: [] });
      }),
    );

    await withNotionForDepartment(client, "dept-a", () =>
      listDataSources("database-a"),
    );
  });

  it("fails closed when no installation is visible", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    await expect(
      withNotionForDepartment(client, "dept-a", () =>
        listDataSources("database-a"),
      ),
    ).rejects.toMatchObject({ error_code: "notion_not_configured" });
  });
});
