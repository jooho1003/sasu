import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  searchNotion: vi.fn(),
  fetchNotionBlockParent: vi.fn(),
  fetchNotionDataSourceParent: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => mocks }));
vi.mock("@/lib/notion", () => ({
  fetchNotionBlockParent: mocks.fetchNotionBlockParent,
  fetchNotionDataSourceParent: mocks.fetchNotionDataSourceParent,
  searchNotion: mocks.searchNotion,
}));
vi.mock("@/lib/jobs", () => ({ enqueue: mocks.enqueue, registerHandler: vi.fn() }));

import { pollNotionInstallation } from "@/lib/pipeline/notion-poll";

describe("Notion 증분 poll", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.fetchNotionBlockParent.mockResolvedValue({ type: "workspace", workspace: true });
    mocks.fetchNotionDataSourceParent.mockResolvedValue({
      type: "database_id",
      database_id: "database-parent",
    });
    mocks.rpc.mockImplementation(async (name: string) => ({
      error: null,
      data: name === "claim_notion_poll"
        ? { root_id: "root-1", poll_watermark: "2026-09-18T00:00:00.000Z", poll_cursor: null, poll_offset: 0, poll_started_at: null }
        : name === "poll_notion_page" ? "import" : true,
    }));
  });

  it("워터마크 이후 수정 세 페이지만 import로 예약하고, 끝난 뒤에만 워터마크를 올린다", async () => {
    mocks.searchNotion.mockResolvedValue({
      results: [
        { id: "p-1", object: "page", inTrash: false, lastEditedTime: "2026-09-18T00:03:00.000Z", title: "A", parent: { type: "workspace", workspace: true } },
        { id: "p-2", object: "page", inTrash: false, lastEditedTime: "2026-09-18T00:02:00.000Z", title: "B", parent: { type: "workspace", workspace: true } },
        { id: "p-3", object: "page", inTrash: false, lastEditedTime: "2026-09-18T00:01:00.000Z", title: "C", parent: { type: "workspace", workspace: true } },
        ...Array.from({ length: 97 }, (_, index) => ({
          id: `old-${index + 1}`,
          object: "page" as const,
          inTrash: false,
          lastEditedTime: "2026-09-17T23:59:00.000Z",
          title: "old",
          parent: { type: "workspace", workspace: true },
        })),
      ], nextCursor: "must-not-read",
    });

    await expect(pollNotionInstallation("root-1", { now: () => Date.parse("2026-09-18T00:05:00.000Z") })).resolves.toEqual({ imports: 3, continued: false });
    expect(mocks.searchNotion).toHaveBeenCalledWith({ cursor: null, sortByEditedDesc: true });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "poll_notion_page")).toHaveLength(3);
    expect(mocks.rpc).toHaveBeenLastCalledWith("finish_notion_poll", expect.objectContaining({
      p_root: "root-1", p_watermark: "2026-09-18T00:03:00.000Z",
    }));
  });

  it("40초 제한에서는 cursor만 저장하고 워터마크를 앞당기지 않은 채 재예약한다", async () => {
    let clock = 0;
    mocks.searchNotion.mockResolvedValue({
      results: [{ id: "p-1", object: "page", inTrash: false, lastEditedTime: "2026-09-18T00:03:00.000Z", title: "A", parent: { type: "workspace", workspace: true } }], nextCursor: "next" },
    );
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_notion_poll") return { error: null, data: { root_id: "root-1", poll_watermark: "2026-09-18T00:00:00.000Z", poll_cursor: null, poll_offset: 0, poll_started_at: null } };
      if (name === "poll_notion_page") { clock = 40_000; return { error: null, data: "import" }; }
      return { error: null, data: true };
    });

    await expect(pollNotionInstallation("root-1", { now: () => clock })).resolves.toEqual({ imports: 1, continued: true });
    expect(mocks.rpc).toHaveBeenCalledWith("save_notion_poll_cursor", expect.objectContaining({ p_cursor: "next" }));
    expect(mocks.rpc.mock.calls.some(([name]) => name === "finish_notion_poll")).toBe(false);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      "notion_poll",
      { rootId: "root-1" },
      { lane: "bulk" },
    );
  });

  it("중단한 검색 페이지의 offset부터 재개하고 완주 전에는 워터마크를 올리지 않는다", async () => {
    let clock = 0;
    let claims = 0;
    mocks.searchNotion.mockResolvedValue({
      results: [
        { id: "p-1", object: "page", inTrash: false, lastEditedTime: "2026-09-18T00:03:00.000Z", title: "A", parent: { type: "workspace", workspace: true } },
        { id: "p-2", object: "page", inTrash: false, lastEditedTime: "2026-09-18T00:02:00.000Z", title: "B", parent: { type: "workspace", workspace: true } },
      ],
      nextCursor: null,
    });
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === "claim_notion_poll") {
        const data = {
          root_id: "root-1",
          poll_watermark: "2026-09-18T00:00:00.000Z",
          poll_cursor: null,
          poll_offset: claims === 0 ? 0 : 1,
          poll_started_at: claims === 0 ? null : "1970-01-01T00:00:00.000Z",
        };
        claims += 1;
        return { error: null, data };
      }
      if (name === "poll_notion_page") {
        if (args.p_page === "p-1") clock = 40_000;
        return { error: null, data: "import" };
      }
      return { error: null, data: true };
    });

    await expect(pollNotionInstallation("root-1", { now: () => clock }))
      .resolves.toEqual({ imports: 1, continued: true });
    expect(mocks.rpc).toHaveBeenCalledWith("save_notion_poll_cursor", expect.objectContaining({
      p_cursor: null,
      p_offset: 1,
    }));
    expect(mocks.rpc.mock.calls.some(([name]) => name === "finish_notion_poll"))
      .toBe(false);

    clock = 300_000;
    mocks.rpc.mockClear();
    await expect(pollNotionInstallation("root-1", { now: () => clock }))
      .resolves.toEqual({ imports: 1, continued: false });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "poll_notion_page"))
      .toHaveLength(1);
    expect(mocks.rpc).toHaveBeenCalledWith("poll_notion_page", expect.objectContaining({
      p_page: "p-2",
    }));
    expect(mocks.rpc).toHaveBeenCalledWith("finish_notion_poll", expect.any(Object));
    expect(mocks.rpc).toHaveBeenCalledWith("finish_notion_poll", expect.objectContaining({
      p_watermark: "1969-12-31T23:58:00.000Z",
    }));
  });

  it("data_source_id 부모는 database 부모로 바꿔 새 DB 행을 등록한다", async () => {
    mocks.searchNotion.mockResolvedValue({
      results: [{
        id: "row-page",
        object: "page",
        inTrash: false,
        lastEditedTime: "2026-09-18T00:03:00.000Z",
        title: "새 행",
        parent: { type: "data_source_id", data_source_id: "data-source-1" },
      }],
      nextCursor: null,
    });

    await pollNotionInstallation("root-1", {
      now: () => Date.parse("2026-09-18T00:05:00.000Z"),
    });

    expect(mocks.fetchNotionDataSourceParent).toHaveBeenCalledWith("data-source-1");
    expect(mocks.rpc).toHaveBeenCalledWith("poll_notion_page", expect.objectContaining({
      p_page: "row-page",
      p_parent: "database-parent",
    }));
  });

  it("block_id 부모는 최대 5단계 안에서 등록된 페이지 부모까지 따라간다", async () => {
    mocks.searchNotion.mockResolvedValue({
      results: [{
        id: "nested-page",
        object: "page",
        inTrash: false,
        lastEditedTime: "2026-09-18T00:03:00.000Z",
        title: "중첩 페이지",
        parent: { type: "block_id", block_id: "block-1" },
      }],
      nextCursor: null,
    });
    mocks.fetchNotionBlockParent
      .mockResolvedValueOnce({ type: "block_id", block_id: "block-2" })
      .mockResolvedValueOnce({ type: "page_id", page_id: "registered-parent" });

    await pollNotionInstallation("root-1", {
      now: () => Date.parse("2026-09-18T00:05:00.000Z"),
    });

    expect(mocks.fetchNotionBlockParent.mock.calls).toEqual([
      ["block-1"],
      ["block-2"],
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith("poll_notion_page", expect.objectContaining({
      p_page: "nested-page",
      p_parent: "registered-parent",
    }));
  });

  it("block_id 부모는 5단계를 넘겨 추적하지 않는다", async () => {
    mocks.searchNotion.mockResolvedValue({
      results: [{
        id: "deep-page",
        object: "page",
        inTrash: false,
        lastEditedTime: "2026-09-18T00:03:00.000Z",
        title: "깊은 페이지",
        parent: { type: "block_id", block_id: "block-1" },
      }],
      nextCursor: null,
    });
    for (let index = 2; index <= 6; index += 1) {
      mocks.fetchNotionBlockParent.mockResolvedValueOnce({
        type: "block_id",
        block_id: `block-${index}`,
      });
    }

    await pollNotionInstallation("root-1", {
      now: () => Date.parse("2026-09-18T00:05:00.000Z"),
    });

    expect(mocks.fetchNotionBlockParent).toHaveBeenCalledTimes(5);
    expect(mocks.rpc).toHaveBeenCalledWith("poll_notion_page", expect.objectContaining({
      p_page: "deep-page",
      p_parent: null,
    }));
  });
});
