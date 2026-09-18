import { afterEach, describe, expect, it, vi } from "vitest";

import {
  extractNotionText,
  normalizeNotionPageId,
  fetchNotionPage,
  fetchNotionBlockParent,
  fetchNotionDataSourceParent,
  fetchNotionPageMeta,
  listDataSources,
  listNotionBlockChildren,
  queryDataSource,
  runWithNotionAuth,
} from "@/lib/notion";

const withToken = <T>(action: () => Promise<T>) =>
  runWithNotionAuth({ token: "synthetic" }, action);

describe("notion adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("유효한 빈 페이지와 잘못된 응답을 구분해 원문 오삭제를 막는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ properties: {} }))
        .mockResolvedValueOnce(Response.json({ error: "unexpected" })),
    );
    await expect(
      withToken(() => fetchNotionPage("12345678123412341234123412341234")),
    ).rejects.toMatchObject({ error_code: "notion_api_failed" });
  });
  it("하위 블록까지 읽으며 잘린 페이지네이션은 성공으로 취급하지 않는다", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ properties: {} }))
      .mockResolvedValueOnce(
        Response.json({
          results: [{ id: "child", type: "toggle", has_children: true }],
          has_more: false,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ results: [], has_more: true, next_cursor: null }),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      withToken(() => fetchNotionPage("12345678123412341234123412341234")),
    ).rejects.toMatchObject({ error_code: "notion_api_failed" });
  });

  it("2025-09-03 헤더를 보내고 429 Retry-After를 작업 재시도에 전달한다", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({}, { status: 429, headers: { "Retry-After": "7" } }),
      );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      withToken(() => fetchNotionPage("12345678123412341234123412341234")),
    ).rejects.toMatchObject({
      error_code: "notion_rate_limited",
      retryAfterSeconds: 7,
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "Notion-Version": "2025-09-03" }),
      }),
    );
  });

  it("404를 공유 해제/없는 페이지 오류로 구분한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({}, { status: 404 })),
    );
    await expect(
      withToken(() => fetchNotionPage("12345678123412341234123412341234")),
    ).rejects.toMatchObject({ error_code: "notion_not_found" });
  });

  it("하위 페이지를 내리지 않는 옵션은 참조만 돌려주고 해당 블록을 요청하지 않는다", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ properties: {} }))
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              id: "child-page",
              type: "child_page",
              child_page: {},
              has_children: true,
            },
            { id: "text-block", type: "paragraph", paragraph: {} },
          ],
          has_more: false,
        }),
      );
    vi.stubGlobal("fetch", fetcher);

    const page = await withToken(() =>
      fetchNotionPage("12345678123412341234123412341234", {
        descendChildPages: false,
      }),
    );
    expect(page.blocks).toEqual([
      { id: "text-block", type: "paragraph", paragraph: {} },
    ]);
    expect(page.children).toEqual([{ kind: "page", id: "child-page" }]);
    expect(fetcher.mock.calls.map(([url]) => String(url))).not.toContain(
      "https://api.notion.com/v1/blocks/child-page/children?page_size=100",
    );
  });

  it("기본값은 현행처럼 하위 페이지 블록까지 읽는다", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ properties: {} }))
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              id: "child-page",
              type: "child_page",
              child_page: {},
              has_children: true,
            },
          ],
          has_more: false,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          results: [{ id: "nested-block", type: "paragraph", paragraph: {} }],
          has_more: false,
        }),
      );
    vi.stubGlobal("fetch", fetcher);

    const page = await withToken(() =>
      fetchNotionPage("12345678123412341234123412341234"),
    );
    expect(page.blocks.map((block) => block.id)).toEqual([
      "child-page",
      "nested-block",
    ]);
    expect(page.children).toEqual([]);
  });

  it("data source 조회와 페이지네이션 쿼리를 새 API 경로와 POST body로 보낸다", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ data_sources: [{ id: "source-1", name: "업무" }] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              id: "page-1",
              last_edited_time: "2026-09-18T00:00:00.000Z",
              in_trash: false,
              parent: { type: "data_source_id", data_source_id: "source-1" },
            },
          ],
          has_more: true,
          next_cursor: "next",
        }),
      );
    vi.stubGlobal("fetch", fetcher);

    await expect(withToken(() => listDataSources("database-1"))).resolves.toEqual([
      { id: "source-1", name: "업무" },
    ]);
    await expect(
      withToken(() => queryDataSource("source-1", "cursor-1")),
    ).resolves.toMatchObject({ nextCursor: "next" });
    expect(fetcher.mock.calls[1]).toEqual([
      "https://api.notion.com/v1/data_sources/source-1/query",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ page_size: 100, start_cursor: "cursor-1" }),
      }),
    ]);
  });

  it("재조정용 메타·자식·블록 부모 조회는 본문을 반환하지 않는다", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({
        id: "12345678-1234-1234-1234-123412341234",
        object: "page",
        properties: {},
        last_edited_time: "2026-09-18T00:00:00.000Z",
        parent: { type: "workspace", workspace: true },
      }))
      .mockResolvedValueOnce(Response.json({
        results: [
          { id: "child-page", type: "child_page", has_children: true },
          { id: "toggle", type: "toggle", has_children: true },
          { id: "paragraph", type: "paragraph", paragraph: { rich_text: [{ plain_text: "본문" }] } },
        ],
        has_more: true,
        next_cursor: "next",
      }))
      .mockResolvedValueOnce(Response.json({
        id: "toggle",
        parent: { type: "page_id", page_id: "parent-page" },
      }))
      .mockResolvedValueOnce(Response.json({
        id: "data-source",
        parent: { type: "database_id", database_id: "database-parent" },
      }));
    vi.stubGlobal("fetch", fetcher);

    await expect(withToken(() => fetchNotionPageMeta(
      "12345678123412341234123412341234",
    ))).resolves.toMatchObject({ id: "12345678-1234-1234-1234-123412341234" });
    await expect(withToken(() => listNotionBlockChildren("page-1")))
      .resolves.toEqual({
        children: [{ kind: "page", id: "child-page" }],
        containers: ["toggle"],
        nextCursor: "next",
      });
    await expect(withToken(() => fetchNotionBlockParent("toggle")))
      .resolves.toEqual({ type: "page_id", page_id: "parent-page" });
    await expect(withToken(() => fetchNotionDataSourceParent("data-source")))
      .resolves.toEqual({ type: "database_id", database_id: "database-parent" });
  });

  it("전역 노션 토큰을 무시하고 요청별 토큰만 사용한다", async () => {
    vi.stubEnv("NOTION_TOKEN", "environment-token");
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ data_sources: [] }));
    vi.stubGlobal("fetch", fetcher);

    await expect(listDataSources("database-1")).rejects.toMatchObject({
      error_code: "notion_not_configured",
    });
    await runWithNotionAuth({ token: "context-token" }, () =>
      listDataSources("database-1"),
    );
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer context-token",
        }),
      }),
    );
  });
  it("normalizes a Notion URL to the page id", () => {
    expect(
      normalizeNotionPageId(
        "https://www.notion.so/acme/12345678123412341234123412341234",
      ),
    ).toBe("12345678-1234-1234-1234-123412341234");
  });

  it("extracts plain text from supported block rich text", () => {
    expect(
      extractNotionText({
        type: "paragraph",
        paragraph: { rich_text: [{ plain_text: "첫 원칙" }] },
      }),
    ).toBe("첫 원칙");
    expect(
      extractNotionText({
        type: "heading_2",
        heading_2: { rich_text: [{ plain_text: "두 번째 원칙" }] },
      }),
    ).toBe("두 번째 원칙");
  });

  it("returns an empty string for unsupported blocks", () => {
    expect(extractNotionText({ type: "divider", divider: {} })).toBe("");
  });
});
