import { describe, expect, it } from "vitest";

import {
  mergeDocumentSummaries,
  verifyDocumentSummary,
} from "@/lib/pipeline/document-summary";

describe("document summary evidence", () => {
  it("drops summary points and citations that are not present in source chunks", () => {
    const result = verifyDocumentSummary(
      {
        citations: [
          { item_id: "item-1", decision_id: null, quote: "정산일은 매월 25일입니다." },
          { item_id: "item-2", decision_id: null, quote: "원문에 없는 인용" },
        ],
        overview: "정산 정책을 설명하는 문서입니다.",
        key_points: [
          { item_id: "item-1", text: "정산일은 매월 25일입니다." },
          { item_id: "item-2", text: "없는 문장" },
        ],
        decisions: [],
        actions: [{ item_id: "item-1", text: "매월 25일에 정산합니다." }],
        open_questions: [],
      },
      new Map([["item-1", "정산일은 매월 25일입니다. 담당자는 세금계산서를 확인합니다."]]),
    );

    expect(result.valid.citations).toEqual([
      { item_id: "item-1", decision_id: null, quote: "정산일은 매월 25일입니다." },
    ]);
    expect(result.valid.key_points).toEqual([
      { item_id: "item-1", text: "정산일은 매월 25일입니다." },
    ]);
    expect(result.valid.actions).toEqual([]);
    expect(result.dropped).toBe(3);
  });

  it("merges chunk summaries without duplicating the same evidence", () => {
    expect(mergeDocumentSummaries([
      {
        citations: [{ item_id: "item-1", decision_id: null, quote: "첫 근거" }],
        overview: "첫 요약",
        key_points: [{ item_id: "item-1", text: "첫 근거" }],
        decisions: [],
        actions: [{ item_id: "item-2", text: "두 번째 액션" }],
        open_questions: [],
      },
      {
        citations: [
          { item_id: "item-1", decision_id: null, quote: "첫 근거" },
          { item_id: "item-3", decision_id: null, quote: "세 번째 근거" },
        ],
        overview: "두 번째 요약",
        key_points: [{ item_id: "item-3", text: "세 번째 근거" }],
        decisions: [{ item_id: "item-3", text: "세 번째 결정" }],
        actions: [{ item_id: "item-2", text: "중복 액션" }],
        open_questions: [],
      },
    ])).toEqual({
      citations: [
        { item_id: "item-1", decision_id: null, quote: "첫 근거" },
        { item_id: "item-3", decision_id: null, quote: "세 번째 근거" },
      ],
      overview: "첫 요약",
      key_points: [
        { item_id: "item-1", text: "첫 근거" },
        { item_id: "item-3", text: "세 번째 근거" },
      ],
      decisions: [{ item_id: "item-3", text: "세 번째 결정" }],
      actions: [{ item_id: "item-2", text: "두 번째 액션" }],
      open_questions: [],
    });
  });
});
