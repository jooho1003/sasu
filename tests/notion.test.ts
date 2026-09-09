import { describe, expect, it } from "vitest";

import { extractNotionText, normalizeNotionPageId } from "@/lib/notion";

describe("notion adapter", () => {
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
