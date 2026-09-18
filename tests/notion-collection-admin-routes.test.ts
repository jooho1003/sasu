import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  enqueue: vi.fn(),
  kickWorker: vi.fn(),
  registerNotionDiscoverHandler: vi.fn(),
  searchNotion: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/site", () => ({ metadataBase: () => new URL("https://sasu.example") }));
vi.mock("@/lib/jobs", () => ({ enqueue: mocks.enqueue, kickWorker: mocks.kickWorker }));
vi.mock("@/lib/pipeline/notion-discover", () => ({ registerNotionDiscoverHandler: mocks.registerNotionDiscoverHandler }));
vi.mock("@/lib/notion", () => ({ searchNotion: mocks.searchNotion }));
vi.mock("@/lib/notion-workspace", () => ({ withNotionForAdmin: async (_client: unknown, action: () => Promise<unknown>) => action() }));

import { POST as saveRoot } from "@/app/api/admin/notion/roots/route";
import { GET as listTopLevel } from "@/app/api/admin/notion/top-level/route";

describe("Notion 관리자 수집 route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.enqueue.mockResolvedValue("job-1");
  });

  it("root 저장 뒤 발견 작업을 예약한다", async () => {
    mocks.rpc.mockResolvedValue({ data: "root-1", error: null });
    const response = await saveRoot(new Request("https://sasu.example/api/admin/notion/roots", {
      method: "POST",
      headers: { origin: "https://sasu.example", "content-type": "application/json" },
      body: JSON.stringify({ dept: "dept-1", scope: "subtree", notion_id: "page-1", kind: "page", title: "영업 위키", visibility: "dept", include_new: true }),
    }));

    expect(response.status).toBe(202);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      "notion_discover",
      { rootId: "root-1" },
      { dedupeKey: expect.stringContaining("root-1:") },
    );
    expect(mocks.kickWorker).toHaveBeenCalledOnce();
  });

  it("미동의 부서는 이름 없이 인원 수만 반환하고 root를 만들지 않는다", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "consent_required:2" } });
    const response = await saveRoot(new Request("https://sasu.example/api/admin/notion/roots", {
      method: "POST",
      headers: { origin: "https://sasu.example", "content-type": "application/json" },
      body: JSON.stringify({ dept: "dept-1", scope: "subtree", notion_id: "page-1", kind: "page", title: "영업 위키", visibility: "dept", include_new: true }),
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "수집 범위를 저장하지 못했습니다.", missing: 2 });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("최상위 항목만 반환하고 제목을 마스킹한다", async () => {
    mocks.searchNotion.mockResolvedValue({
      results: [
        { id: "top-1", title: "담당자 user@example.com", object: "page", inTrash: false, parent: { type: "workspace" } },
        { id: "child-1", title: "비밀 하위 페이지 제목", object: "page", inTrash: false, parent: { type: "page_id" } },
      ],
    });

    const response = await listTopLevel();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).not.toContain("user@example.com");
    expect(text).not.toContain("비밀 하위 페이지 제목");
    expect(JSON.parse(text).results).toHaveLength(1);
  });
});
