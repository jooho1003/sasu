import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetchNotionPage: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/notion", async original => ({ ...(await original<typeof import("@/lib/notion")>()), fetchNotionPage: mocks.fetchNotionPage }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => mocks }));
vi.mock("@/lib/jobs", () => ({ registerHandler: vi.fn() }));
import { importNotionSource } from "@/lib/pipeline/notion-import";
describe("Notion 원자 스냅샷 동기화", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const query = { eq: () => query, maybeSingle: async () => ({ data: { id: "source-1", dept_id: "dept-1", external_id: "page-id", kind: "notion_page", active: true }, error: null }) };
    mocks.from.mockReturnValue({ select: () => query });
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "begin_notion_sync" ? true : { inserted: 1, updated: 0, deleted: 1 }, error: null }));
    mocks.fetchNotionPage.mockResolvedValue({ title: "원칙", blocks: [{ id: "block-1", type: "paragraph", paragraph: { rich_text: [{ plain_text: "연락 qa@example.com" }] } }] });
  });
  it("전체 조회 후 마스킹한 스냅샷을 동일 lease로 한 번만 반영한다", async () => {
    expect(await importNotionSource("source-1")).toEqual({ inserted: 1, updated: 0, deleted: 1 });
    const lease=mocks.rpc.mock.calls[0][1].p_lease;
    expect(mocks.rpc).toHaveBeenCalledWith("finish_notion_sync", expect.objectContaining({ p_lease: lease, p_items: [{ external_ref: "block-1", content: "연락 [이메일]" }] }));
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("qa@example.com");
  });
  it("다른 동기화가 진행 중이면 페이지도 읽지 않는다", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect(await importNotionSource("source-1")).toEqual({ inserted: 0, updated: 0, deleted: 0 });
    expect(mocks.fetchNotionPage).not.toHaveBeenCalled();
  });
  it("부분 조회 실패 시 삭제 없이 lease만 해제한다", async () => {
    mocks.fetchNotionPage.mockRejectedValue(Object.assign(new Error("failed"), { error_code: "notion_api_failed" }));
    await expect(importNotionSource("source-1")).rejects.toMatchObject({ error_code: "notion_api_failed" });
    expect(mocks.rpc.mock.calls.map(c=>c[0])).toEqual(["begin_notion_sync","release_notion_sync"]);
  });
  it("lease를 잃은 늦은 결과는 성공 반영으로 보고하지 않는다", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "begin_notion_sync" ? true : null, error: null }));
    expect(await importNotionSource("source-1")).toEqual({ inserted: 0, updated: 0, deleted: 0 });
  });
});
