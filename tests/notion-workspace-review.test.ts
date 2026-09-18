import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptNotionToken } from "@/lib/notion-installation";
import { withNotionForDepartment, withNotionForJob } from "@/lib/notion-workspace";
import { listDataSources } from "@/lib/notion";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const read = () => listDataSources("database");
function client(token: string, org = "org-a") {
  return { rpc: vi.fn().mockResolvedValue({ error: null, data: {
    org_id: org, workspace_id: "workspace", encrypted_token: encryptNotionToken(token, org, "workspace"),
  } }) };
}
describe("Notion workspace context", () => {
  it("isolates simultaneous department/job tokens and leaves no ambient credential", async () => {
    vi.stubEnv("NOTION_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    vi.stubEnv("NOTION_TOKEN", "legacy-must-not-be-used");
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      seen.push(init.headers.Authorization);
      return Response.json({ data_sources: [] });
    }));
    const a = client("token-a"), b = client("token-b", "org-b");
    await Promise.all([
      withNotionForDepartment(a, "dept-a", async () => { await Promise.resolve(); return read(); }),
      withNotionForJob(b, "job-b", read),
    ]);
    expect(seen.sort()).toEqual(["Bearer token-a", "Bearer token-b"]);
    expect(a.rpc).toHaveBeenCalledWith("notion_installation_for_department", { p_dept: "dept-a" });
    expect(b.rpc).toHaveBeenCalledWith("notion_installation_for_job", { p_job: "job-b" });
    await expect(read()).rejects.toMatchObject({ error_code: "notion_not_configured" });
  });
  it("fails closed before an API request when installation lookup is empty, failed or corrupt", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const result of [{ data: null, error: null }, { data: null, error: { message: "private" } }, { data: { encrypted_token: "secret" }, error: null }]) {
      const db = { rpc: vi.fn().mockResolvedValue(result) };
      await expect(withNotionForDepartment(db, "dept", read)).rejects.toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("revalidates nested department requests instead of reusing another organization's credential", async () => {
    vi.stubEnv("NOTION_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      seen.push(init.headers.Authorization);
      return Response.json({ data_sources: [] });
    }));
    const a = client("token-a"), b = client("token-b", "org-b");
    await withNotionForDepartment(a, "dept-a", async () => {
      await withNotionForDepartment(b, "dept-b", read);
      await read();
    });
    expect(seen).toEqual(["Bearer token-b", "Bearer token-a"]);
    expect(b.rpc).toHaveBeenCalledWith("notion_installation_for_department", { p_dept: "dept-b" });
  });
  it("does not let an outer installation bypass a revoked or unauthorized inner lookup", async () => {
    vi.stubEnv("NOTION_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data_sources: [] }));
    vi.stubGlobal("fetch", fetcher);
    const revoked = { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) };
    await withNotionForJob(client("token-a"), "job-a", async () => {
      await expect(withNotionForDepartment(revoked, "dept-b", read)).rejects.toMatchObject({ error_code: "notion_not_configured" });
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
