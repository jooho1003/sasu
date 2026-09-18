import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  fetchNotionBlockParent: vi.fn(),
  fetchNotionDataSourceParent: vi.fn(),
  fetchNotionPageMeta: vi.fn(),
  listDataSources: vi.fn(),
  listNotionBlockChildren: vi.fn(),
  queryDataSource: vi.fn(),
  registerHandler: vi.fn(),
  rpc: vi.fn(),
  searchNotion: vi.fn(),
}));

vi.mock("@/lib/jobs", () => ({
  enqueue: mocks.enqueue,
  registerHandler: mocks.registerHandler,
}));
vi.mock("@/lib/notion", async (original) => ({
  ...(await original<typeof import("@/lib/notion")>()),
  fetchNotionBlockParent: mocks.fetchNotionBlockParent,
  fetchNotionDataSourceParent: mocks.fetchNotionDataSourceParent,
  fetchNotionPageMeta: mocks.fetchNotionPageMeta,
  listDataSources: mocks.listDataSources,
  listNotionBlockChildren: mocks.listNotionBlockChildren,
  queryDataSource: mocks.queryDataSource,
  searchNotion: mocks.searchNotion,
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

import { NotionError } from "@/lib/notion";
import {
  discoverNotionRoot,
  registerNotionDiscoverHandler,
} from "@/lib/pipeline/notion-discover";

const root = {
  id: "root-1",
  scope: "workspace",
  notion_id: null,
  notion_kind: null,
  discover_cursor: null,
};

describe("Notion 범위 발견", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.enqueue.mockResolvedValue("continuation-job");
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_notion_discovery") {
        return { data: root, error: null };
      }
      if (name === "register_notion_page") {
        return { data: "created", error: null };
      }
      return { data: true, error: null };
    });
    mocks.searchNotion.mockResolvedValue({ results: [], nextCursor: null });
    mocks.fetchNotionBlockParent.mockResolvedValue({
      type: "page_id",
      page_id: "parent-page",
    });
    mocks.fetchNotionDataSourceParent.mockResolvedValue({
      type: "database_id",
      database_id: "database-parent",
    });
    mocks.fetchNotionPageMeta.mockResolvedValue({
      id: "page-1",
      object: "page",
      title: "페이지",
      lastEditedTime: "2026-09-18T01:00:00.000Z",
      inTrash: false,
      parent: { type: "workspace", workspace: true },
    });
    mocks.listNotionBlockChildren.mockResolvedValue({
      children: [],
      containers: [],
      nextCursor: null,
    });
    mocks.listDataSources.mockResolvedValue([]);
    mocks.queryDataSource.mockResolvedValue({ pages: [], nextCursor: null });
  });

  it("workspace 검색에서 page만 등록하고 data_source 결과는 건너뛴다", async () => {
    mocks.searchNotion.mockResolvedValue({
      results: [
        {
          id: "page-1",
          object: "page",
          title: "연락 qa@example.com",
          lastEditedTime: "2026-09-18T01:00:00.000Z",
          inTrash: false,
          parent: { type: "workspace", workspace: true },
        },
        {
          id: "data-source-1",
          object: "data_source",
          title: "지원자 목록",
          lastEditedTime: "2026-09-18T01:00:00.000Z",
          inTrash: false,
          parent: { type: "database_id", database_id: "database-1" },
        },
      ],
      nextCursor: null,
    });

    await expect(discoverNotionRoot("root-1")).resolves.toEqual({
      registered: 1,
      unsupported: 0,
      continued: false,
    });

    expect(mocks.rpc).toHaveBeenCalledWith("register_notion_page", {
      p_root: "root-1",
      p_page: "page-1",
      p_parent: null,
      p_remote_edited_at: "2026-09-18T01:00:00.000Z",
      p_title: "연락 [이메일]",
    });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("data-source-1");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_discover_cursor",
      expect.objectContaining({
        p_root: "root-1",
        p_cursor: { mode: "imports", unassignedDone: true },
        p_done: false,
      }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith("settle_notion_root", {
      p_root: "root-1",
    });
  });

  it("database root는 모든 data source 페이지를 페이지네이션해 등록한다", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_notion_discovery") {
        return {
          data: {
            ...root,
            scope: "subtree",
            notion_id: "database-1",
            notion_kind: "database",
          },
          error: null,
        };
      }
      if (name === "register_notion_page") return { data: "created", error: null };
      return { data: true, error: null };
    });
    mocks.listDataSources.mockResolvedValue([
      { id: "data-source-1", name: "기본 보기" },
      { id: "data-source-2", name: null },
    ]);
    mocks.queryDataSource
      .mockResolvedValueOnce({
        pages: [
          {
            id: "row-1",
            object: "page",
            title: "첫 행",
            lastEditedTime: "2026-09-18T01:00:00.000Z",
            inTrash: false,
            parent: { type: "data_source_id", data_source_id: "data-source-1" },
          },
        ],
        nextCursor: "next-1",
      })
      .mockResolvedValueOnce({
        pages: [
          {
            id: "row-2",
            object: "page",
            title: "둘째 행",
            lastEditedTime: "2026-09-18T01:01:00.000Z",
            inTrash: false,
            parent: { type: "data_source_id", data_source_id: "data-source-1" },
          },
        ],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ pages: [], nextCursor: null });

    await expect(discoverNotionRoot("root-1")).resolves.toMatchObject({
      registered: 3,
      unsupported: 0,
      continued: false,
    });

    expect(mocks.queryDataSource.mock.calls).toEqual([
      ["data-source-1", null],
      ["data-source-1", "next-1"],
      ["data-source-2", null],
    ]);
    expect(
      mocks.rpc.mock.calls.filter(([name]) => name === "register_notion_page"),
    ).toHaveLength(3);
  });

  it("지원하지 않는 database 항목은 root 전체를 실패시키지 않고 집계한다", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_notion_discovery") {
        return {
          data: {
            ...root,
            scope: "subtree",
            notion_id: "database-1",
            notion_kind: "database",
          },
          error: null,
        };
      }
      if (name === "register_notion_page") return { data: "created", error: null };
      return { data: true, error: null };
    });
    mocks.listDataSources.mockRejectedValue(
      new NotionError("notion_database_unsupported"),
    );

    await expect(discoverNotionRoot("root-1")).resolves.toEqual({
      registered: 1,
      unsupported: 1,
      continued: false,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("record_notion_discover_unsupported", {
      p_root: "root-1",
      p_count: 1,
    });
  });

  it("page root import가 큐에 넣은 database는 root 페이지를 다시 읽지 않고 이어서 처리한다", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_notion_discovery") {
        return {
          data: {
            ...root,
            scope: "subtree",
            notion_id: "page-root",
            notion_kind: "page",
            discover_cursor: {
              mode: "database",
              pending: [],
              databases: [{ id: "data-source-1", parent: "database-1" }],
              databaseIndex: 0,
              dataSourceCursor: null,
            },
          },
          error: null,
        };
      }
      if (name === "register_notion_page") return { data: "created", error: null };
      return { data: true, error: null };
    });
    mocks.queryDataSource.mockResolvedValue({
      pages: [{
        id: "row-1",
        object: "page",
        title: "행",
        lastEditedTime: "2026-09-18T01:00:00.000Z",
        inTrash: false,
        parent: { type: "data_source_id", data_source_id: "data-source-1" },
      }],
      nextCursor: null,
    });

    await discoverNotionRoot("root-1");

    const registrations = mocks.rpc.mock.calls.filter(
      ([name]) => name === "register_notion_page",
    );
    expect(registrations).toHaveLength(1);
    expect(registrations[0][1]).toMatchObject({
      p_page: "row-1",
      p_parent: "database-1",
    });
  });

  it("subtree 미배정 집계 phase는 페이지 id를 저장하지 않고 개수만 반영한다", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_notion_discovery") {
        return {
          data: {
            ...root,
            scope: "subtree",
            notion_id: "page-root",
            notion_kind: "page",
            discover_cursor: {
              mode: "imports",
              unassignedCursor: null,
              unassignedCount: 0,
            },
          },
          error: null,
        };
      }
      if (name === "notion_page_is_assigned") {
        return { data: false, error: null };
      }
      return { data: true, error: null };
    });
    mocks.searchNotion.mockResolvedValue({
      results: [{
        id: "outside-page",
        object: "page",
        title: "저장하면 안 되는 제목",
        lastEditedTime: "2026-09-18T01:00:00.000Z",
        inTrash: false,
        parent: { type: "workspace", workspace: true },
      }],
      nextCursor: null,
    });

    await discoverNotionRoot("root-1");

    expect(mocks.rpc).toHaveBeenCalledWith("set_notion_unassigned_count", {
      p_root: "root-1",
      p_count: 1,
    });
    const saved = mocks.rpc.mock.calls.find(
      ([name]) => name === "save_discover_cursor",
    )?.[1];
    expect(JSON.stringify(saved)).not.toContain("outside-page");
    expect(JSON.stringify(saved)).not.toContain("저장하면 안 되는 제목");
  });

  it("40초 상한에 닿으면 현재 위치를 저장하고 같은 kind를 다시 예약한다", async () => {
    mocks.searchNotion.mockResolvedValue({
      results: [
        {
          id: "page-1",
          object: "page",
          title: "페이지",
          lastEditedTime: "2026-09-18T01:00:00.000Z",
          inTrash: false,
          parent: { type: "workspace", workspace: true },
        },
      ],
      nextCursor: "cursor-2",
    });
    const times = [0, 41_000];

    await expect(
      discoverNotionRoot("root-1", { now: () => times.shift() ?? 41_000 }),
    ).resolves.toEqual({ registered: 1, unsupported: 0, continued: true });

    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_discover_cursor",
      expect.objectContaining({
        p_root: "root-1",
        p_cursor: expect.objectContaining({ searchCursor: "cursor-2" }),
        p_done: false,
      }),
    );
    expect(mocks.enqueue).toHaveBeenCalledWith("notion_discover", {
      rootId: "root-1",
    });
  });

  it("429는 커서를 저장한 뒤 retryAfterSeconds가 있는 원래 오류를 다시 던진다", async () => {
    const rateLimit = new NotionError("notion_rate_limited", 17);
    mocks.searchNotion.mockRejectedValue(rateLimit);

    await expect(discoverNotionRoot("root-1")).rejects.toBe(rateLimit);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_discover_cursor",
      expect.objectContaining({
        p_root: "root-1",
        p_cursor: expect.objectContaining({ mode: "workspace" }),
        p_done: false,
      }),
    );
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("job payload는 rootId 하나만 허용해 공통 워커에 등록한다", async () => {
    registerNotionDiscoverHandler();
    expect(mocks.registerHandler).toHaveBeenCalledWith(
      "notion_discover",
      expect.any(Function),
    );
    const handler = mocks.registerHandler.mock.calls[0][1] as (
      payload: unknown,
    ) => Promise<void>;
    await handler({ rootId: "root-1" });
    await expect(handler({ rootId: "" })).rejects.toThrow(
      "notion_discover job payload is invalid",
    );
  });

  it("reconcile은 메타데이터와 자식 참조만 다시 내려가고 완주 뒤 정리한다", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_notion_reconcile") {
        return {
          data: {
            ...root,
            known_pages: [{ id: "known-page", parent: null }],
          },
          error: null,
        };
      }
      if (name === "reconcile_notion_page") {
        return { data: "unchanged", error: null };
      }
      return { data: true, error: null };
    });
    mocks.fetchNotionPageMeta
      .mockResolvedValueOnce({
        id: "known-page",
        object: "page",
        title: "기존",
        lastEditedTime: "2026-09-18T01:00:00.000Z",
        inTrash: false,
        parent: { type: "workspace", workspace: true },
      })
      .mockResolvedValueOnce({
        id: "child-page",
        object: "page",
        title: "자식",
        lastEditedTime: "2026-09-18T01:01:00.000Z",
        inTrash: false,
        parent: { type: "page_id", page_id: "known-page" },
      });
    mocks.listNotionBlockChildren
      .mockResolvedValueOnce({
        children: [{ kind: "page", id: "child-page" }],
        containers: [],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ children: [], containers: [], nextCursor: null });

    await expect(discoverNotionRoot("root-1", {
      reconcile: true,
      now: () => Date.parse("2026-09-18T02:00:00.000Z"),
    })).resolves.toEqual({ registered: 0, unsupported: 0, continued: false });

    expect(mocks.fetchNotionPageMeta.mock.calls).toEqual([
      ["known-page"],
      ["child-page"],
    ]);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "reconcile_notion_page"))
      .toHaveLength(2);
    expect(mocks.rpc).toHaveBeenCalledWith("finish_notion_reconcile", expect.objectContaining({
      p_root: "root-1",
    }));
  });

  it("reconcile 이어하기는 reconcile payload와 현재 큐를 보존한다", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_notion_reconcile") {
        return {
          data: {
            ...root,
            known_pages: [{ id: "known-page", parent: null }],
          },
          error: null,
        };
      }
      if (name === "reconcile_notion_page") return { data: "unchanged", error: null };
      return { data: true, error: null };
    });
    mocks.fetchNotionPageMeta.mockResolvedValue({
      id: "known-page",
      object: "page",
      title: "기존",
      lastEditedTime: "2026-09-18T01:00:00.000Z",
      inTrash: false,
      parent: { type: "workspace", workspace: true },
    });
    mocks.listNotionBlockChildren.mockResolvedValue({
      children: [],
      containers: [],
      nextCursor: null,
    });
    const times = [0, 0, 41_000];

    await expect(discoverNotionRoot("root-1", {
      reconcile: true,
      now: () => times.shift() ?? 41_000,
    })).resolves.toEqual({ registered: 0, unsupported: 0, continued: true });

    expect(mocks.rpc).toHaveBeenCalledWith("save_discover_cursor", expect.objectContaining({
      p_cursor: expect.objectContaining({ mode: "reconcile" }),
      p_done: false,
    }));
    expect(mocks.enqueue).toHaveBeenCalledWith(
      "notion_discover",
      { rootId: "root-1", reconcile: true },
      { lane: "bulk" },
    );
    expect(mocks.rpc.mock.calls.some(([name]) => name === "finish_notion_reconcile"))
      .toBe(false);
  });

  it("reconcile 검색의 block_id 부모도 가까운 subtree 판정용 페이지까지 해석한다", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_notion_reconcile") {
        return { data: { ...root, known_pages: [] }, error: null };
      }
      if (name === "reconcile_notion_page") return { data: "excluded", error: null };
      return { data: true, error: null };
    });
    mocks.searchNotion.mockResolvedValue({
      results: [{
        id: "nested-page",
        object: "page",
        title: "중첩",
        lastEditedTime: "2026-09-18T01:00:00.000Z",
        inTrash: false,
        parent: { type: "block_id", block_id: "block-1" },
      }],
      nextCursor: null,
    });
    mocks.fetchNotionBlockParent.mockResolvedValue({
      type: "page_id",
      page_id: "subtree-parent",
    });

    await discoverNotionRoot("root-1", { reconcile: true });

    expect(mocks.fetchNotionBlockParent).toHaveBeenCalledWith("block-1");
    expect(mocks.rpc).toHaveBeenCalledWith("reconcile_notion_page", expect.objectContaining({
      p_page: "nested-page",
      p_parent: "subtree-parent",
    }));
    expect(mocks.listNotionBlockChildren).not.toHaveBeenCalled();
  });

  it("reconcile 직접 조회의 404와 휴지통 페이지는 seen 처리하지 않고 완주 정리에 맡긴다", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_notion_reconcile") {
        return {
          data: {
            ...root,
            known_pages: [
              { id: "shared-off", parent: null },
              { id: "trashed", parent: null },
            ],
          },
          error: null,
        };
      }
      return { data: true, error: null };
    });
    mocks.fetchNotionPageMeta
      .mockRejectedValueOnce(new NotionError("notion_not_found"))
      .mockResolvedValueOnce({
        id: "trashed",
        object: "page",
        title: "휴지통",
        lastEditedTime: "2026-09-18T01:00:00.000Z",
        inTrash: true,
        parent: { type: "workspace", workspace: true },
      });

    await discoverNotionRoot("root-1", { reconcile: true });

    expect(mocks.rpc.mock.calls.some(([name]) => name === "reconcile_notion_page"))
      .toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith("finish_notion_reconcile", expect.any(Object));
  });

  it("database subtree reconcile은 행 조회 전에 root source를 seen 처리한다", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_notion_reconcile") {
        return {
          data: {
            ...root,
            scope: "subtree",
            notion_id: "database-root",
            notion_kind: "database",
            known_pages: [],
          },
          error: null,
        };
      }
      if (name === "reconcile_notion_page") return { data: "unchanged", error: null };
      return { data: true, error: null };
    });

    await discoverNotionRoot("root-1", { reconcile: true });

    expect(mocks.rpc).toHaveBeenCalledWith("reconcile_notion_page", expect.objectContaining({
      p_page: "database-root",
      p_remote_edited_at: null,
    }));
    expect(mocks.listDataSources).toHaveBeenCalledWith("database-root");
  });

  it("database 재조정 조회 실패는 이전 source를 retire하지 않고 커서를 보존해 재시도한다", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_notion_reconcile") {
        return {
          data: {
            ...root,
            scope: "subtree",
            notion_id: "database-root",
            notion_kind: "database",
            known_pages: [],
          },
          error: null,
        };
      }
      if (name === "reconcile_notion_page") return { data: "unchanged", error: null };
      return { data: true, error: null };
    });
    const failure = new NotionError("notion_api_failed");
    mocks.listDataSources.mockRejectedValue(failure);

    await expect(discoverNotionRoot("root-1", { reconcile: true }))
      .rejects.toBe(failure);

    expect(mocks.rpc).toHaveBeenCalledWith("save_discover_cursor", expect.objectContaining({
      p_cursor: expect.objectContaining({ mode: "reconcile" }),
      p_done: false,
    }));
    expect(mocks.rpc.mock.calls.some(([name]) => name === "finish_notion_reconcile"))
      .toBe(false);
  });

  it("reconcile job payload의 불리언만 전달한다", async () => {
    registerNotionDiscoverHandler();
    const handler = mocks.registerHandler.mock.calls[0][1] as (
      payload: unknown,
    ) => Promise<void>;
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await handler({ rootId: "root-1", reconcile: true });

    expect(mocks.rpc).toHaveBeenCalledWith("claim_notion_reconcile", expect.any(Object));
    await expect(handler({ rootId: "root-1", reconcile: "yes" })).rejects.toThrow(
      "notion_discover job payload is invalid",
    );
  });
});
