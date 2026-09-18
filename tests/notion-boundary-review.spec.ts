// Independent review probes; opt in with the review config. No external calls.
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), service: vi.fn(), who: vi.fn(), getUser: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc, auth: { getUser: mocks.getUser }, from: mocks.from }) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => ({ rpc: mocks.service }) }));
vi.mock("@/lib/features", () => ({ orgAdminReadEnabled: () => true, orgAdminWritesEnabled: () => true }));
vi.mock("@/lib/site", () => ({ metadataBase: () => new URL("https://sasu.example") }));
vi.mock("@/lib/notion", () => ({ notionWhoAmI: mocks.who, runWithNotionAuth: async (_auth: unknown, action: () => Promise<unknown>) => action() }));
import { POST } from "@/app/api/admin/notion/route";
const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const request = (body: unknown) => new Request("https://sasu.example/api/admin/notion", {
  method: "POST", headers: { origin: "https://sasu.example", "content-type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NOTION_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"));
  mocks.getUser.mockResolvedValue({ data: { user: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } }, error: null });
  mocks.rpc.mockResolvedValue({ data: org, error: null });
  mocks.rpc.mockImplementation(async (name: string) => name === "admin_org_id"
    ? { data: org, error: null }
    : { data: null, error: { code: "42501", message: "forbidden" } });
  mocks.who.mockResolvedValue({ botId: "synthetic-bot", workspaceId: "synthetic-workspace", workspaceName: "QA" });
  mocks.service.mockResolvedValue({ data: null, error: { code: "42501", message: "forbidden" } });
});
afterEach(() => vi.unstubAllEnvs());

it("JSON null is rejected as 400 without throwing or calling Notion", async () => {
  const response = await POST(request(null));
  expect(response.status).toBe(400);
  expect(mocks.who).not.toHaveBeenCalled();
});

it("a demo organization admin is rejected before the external token validation call", async () => {
  // admin_org_id currently returns demo orgs too; the DB persistence RPC rejects
  // them later. A successful lookup alone must not authorize an external call.
  await POST(request({ token: "synthetic-notion-token", attested: true }));
  expect(mocks.who).not.toHaveBeenCalled();
  expect(mocks.service).not.toHaveBeenCalled();
});
