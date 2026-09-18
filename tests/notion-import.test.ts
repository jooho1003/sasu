import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetchNotionPage: vi.fn(), rpc: vi.fn(), from: vi.fn(), withNotionForDepartment: vi.fn() }));
vi.mock("@/lib/notion", async original => ({ ...(await original<typeof import("@/lib/notion")>()), fetchNotionPage: mocks.fetchNotionPage }));
vi.mock("@/lib/notion-workspace", () => ({ withNotionForDepartment: mocks.withNotionForDepartment }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => mocks }));
vi.mock("@/lib/jobs", () => ({ registerHandler: vi.fn() }));
import { importNotionSource } from "@/lib/pipeline/notion-import";
describe("Notion 원자 스냅샷 동기화", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.withNotionForDepartment.mockImplementation(async (_client, _dept, action: () => Promise<unknown>) => action());
    const query = { eq: () => query, maybeSingle: async () => ({ data: { id: "source-1", dept_id: "dept-1", external_id: "page-id", kind: "notion_page", active: true, import_version: 1, root_id: null }, error: null }) };
    mocks.from.mockReturnValue({ select: () => query });
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === "begin_notion_sync"
        ? true
        : name === "finish_notion_sync"
          ? { inserted: 1, updated: 0, deleted: 1 }
          : name === "register_notion_page"
            ? "created"
            : true,
      error: null,
    }));
    mocks.fetchNotionPage.mockResolvedValue({ title: "원칙", blocks: [{ id: "block-1", type: "paragraph", paragraph: { rich_text: [{ plain_text: "연락 qa@example.com" }] } }], children: [], properties: {}, meta: { lastEditedTime: "2026-09-18T01:02:03.000Z", inTrash: false } });
  });
  it("전체 조회 후 마스킹한 스냅샷을 동일 lease로 한 번만 반영한다", async () => {
    expect(await importNotionSource("source-1")).toEqual({ inserted: 1, updated: 0, deleted: 1, children: [] });
    const lease=mocks.rpc.mock.calls[0][1].p_lease;
    expect(mocks.fetchNotionPage).toHaveBeenCalledWith("page-id");
    expect(mocks.rpc).toHaveBeenCalledWith("finish_notion_sync", expect.objectContaining({ p_lease: lease, p_items: [{ external_ref: "block-1", content: "연락 [이메일]" }], p_remote_edited_at: null }));
    expect(mocks.withNotionForDepartment).toHaveBeenCalledWith(mocks, "dept-1", expect.any(Function));
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("qa@example.com");
  });
  it("v2는 하위 페이지를 본문에서 빼고 헤딩 청크와 편집 시각을 반영한다", async () => {
    const query = { eq: () => query, maybeSingle: async () => ({ data: { id: "source-1", dept_id: "dept-1", external_id: "page-id", kind: "notion_page", active: true, import_version: 2, root_id: "root-1" }, error: null }) };
    mocks.from.mockReturnValue({ select: () => query });
    mocks.fetchNotionPage.mockResolvedValue({
      title: "운영 원칙",
      blocks: [
        { id: "heading", type: "heading_2", heading_2: { rich_text: [{ plain_text: "비용 원칙" }] } },
        { id: "body", type: "paragraph", paragraph: { rich_text: [{ plain_text: "예산 변경은 담당자의 검토와 승인을 거쳐야 하며 모든 근거를 기록합니다." }] } },
      ],
      children: [{ kind: "page", id: "child-1" }, { kind: "database", id: "database-1" }],
      properties: { 상태: { type: "status", status: { name: "확정" } } },
      meta: { lastEditedTime: "2026-09-18T01:02:03.000Z", inTrash: false },
    });

    await expect(importNotionSource("source-1")).resolves.toEqual({
      inserted: 1,
      updated: 0,
      deleted: 1,
      children: [{ kind: "page", id: "child-1" }, { kind: "database", id: "database-1" }],
    });
    expect(mocks.fetchNotionPage).toHaveBeenCalledWith("page-id", { descendChildPages: false });
    expect(mocks.rpc).toHaveBeenCalledWith("finish_notion_sync", expect.objectContaining({
      p_items: [{ external_ref: "heading", content: "상태: 확정\n비용 원칙\n예산 변경은 담당자의 검토와 승인을 거쳐야 하며 모든 근거를 기록합니다." }],
      p_remote_edited_at: "2026-09-18T01:02:03.000Z",
    }));
    expect(mocks.rpc).toHaveBeenCalledWith("register_notion_page", {
      p_root: "root-1", p_page: "child-1", p_parent: "page-id",
      p_remote_edited_at: null, p_title: null,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("register_notion_page", {
      p_root: "root-1", p_page: "database-1", p_parent: "page-id",
      p_remote_edited_at: null, p_title: null,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("queue_notion_database", {
      p_root: "root-1", p_database: "database-1", p_parent: "page-id",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("settle_notion_root", { p_root: "root-1" });
  });
  it("다른 동기화가 진행 중이면 페이지도 읽지 않는다", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect(await importNotionSource("source-1")).toEqual({ inserted: 0, updated: 0, deleted: 0, children: [] });
    expect(mocks.fetchNotionPage).not.toHaveBeenCalled();
  });
  it("부분 조회 실패 시 삭제 없이 lease만 해제한다", async () => {
    mocks.fetchNotionPage.mockRejectedValue(Object.assign(new Error("failed"), { error_code: "notion_api_failed" }));
    await expect(importNotionSource("source-1")).rejects.toMatchObject({ error_code: "notion_api_failed" });
    expect(mocks.rpc.mock.calls.map(c=>c[0])).toEqual(["begin_notion_sync","release_notion_sync"]);
  });
  it("lease를 잃은 늦은 결과는 성공 반영으로 보고하지 않는다", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "begin_notion_sync" ? true : null, error: null }));
    expect(await importNotionSource("source-1")).toEqual({ inserted: 0, updated: 0, deleted: 0, children: [] });
  });
  it("404는 lease를 해제하는 대신 소스와 item을 retire한다", async () => {
    mocks.fetchNotionPage.mockRejectedValue(Object.assign(new Error("missing"), { error_code: "notion_not_found" }));

    await expect(importNotionSource("source-1")).resolves.toEqual({ inserted: 0, updated: 0, deleted: 0, children: [] });
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["begin_notion_sync", "retire_notion_source"]);
    expect(mocks.rpc).toHaveBeenLastCalledWith("retire_notion_source", expect.objectContaining({ p_reason: "notion_not_found" }));
  });
  it("휴지통 페이지도 스냅샷을 반영하지 않고 retire한다", async () => {
    mocks.fetchNotionPage.mockResolvedValue({ title: "삭제됨", blocks: [], children: [], properties: {}, meta: { lastEditedTime: "", inTrash: true } });

    await expect(importNotionSource("source-1")).resolves.toEqual({ inserted: 0, updated: 0, deleted: 0, children: [] });
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["begin_notion_sync", "retire_notion_source"]);
  });
});
