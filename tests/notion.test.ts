import { afterEach, describe, expect, it, vi } from "vitest";

import { extractNotionText, normalizeNotionPageId, fetchNotionPage } from "@/lib/notion";

describe("notion adapter", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("유효한 빈 페이지와 잘못된 응답을 구분해 원문 오삭제를 막는다", async () => {
    vi.stubEnv("NOTION_TOKEN", "synthetic");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ properties: {} })).mockResolvedValueOnce(Response.json({ error: "unexpected" })));
    await expect(fetchNotionPage("12345678123412341234123412341234")).rejects.toMatchObject({ error_code: "notion_api_failed" });
  });
  it("하위 블록까지 읽으며 잘린 페이지네이션은 성공으로 취급하지 않는다", async () => {
    vi.stubEnv("NOTION_TOKEN", "synthetic");
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ properties: {} }))
      .mockResolvedValueOnce(Response.json({ results: [{ id: "child", type: "toggle", has_children: true }], has_more: false }))
      .mockResolvedValueOnce(Response.json({ results: [], has_more: true, next_cursor: null }));
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchNotionPage("12345678123412341234123412341234")).rejects.toMatchObject({ error_code: "notion_api_failed" });
  });
  it("normalizes a Notion URL to the page id", () => {
    expect(normalizeNotionPageId("https://www.notion.so/acme/12345678123412341234123412341234")).toBe("12345678-1234-1234-1234-123412341234");
  });

  it("extracts plain text from supported block rich text", () => {
    expect(extractNotionText({ type: "paragraph", paragraph: { rich_text: [{ plain_text: "첫 원칙" }] } })).toBe("첫 원칙");
    expect(extractNotionText({ type: "heading_2", heading_2: { rich_text: [{ plain_text: "두 번째 원칙" }] } })).toBe("두 번째 원칙");
  });

  it("returns an empty string for unsupported blocks", () => {
    expect(extractNotionText({ type: "divider", divider: {} })).toBe("");
  });
});
