import { describe, expect, it } from "vitest";

import { toNotionItems } from "@/lib/pipeline/notion-import";

describe("notion import pipeline", () => {
  it("creates masked items only for blocks with text", () => {
    expect(toNotionItems({
      sourceId: "source-1",
      deptId: "dept-1",
      blocks: [
        { id: "block-1", type: "paragraph", paragraph: { rich_text: [{ plain_text: "연락처 test@example.com" }] } },
        { id: "block-2", type: "divider", divider: {} },
      ],
    })).toEqual([{ source_id: "source-1", dept_id: "dept-1", external_ref: "block-1", author_ext_id: null, author: "Notion", spoken_at: null, content: "연락처 [이메일]" }]);
  });
});
