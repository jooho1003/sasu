import { describe, expect, it } from "vitest";

import {
  buildAnswerEvidence,
  verifyAnswerCitations,
} from "@/lib/pipeline/answer";

describe("answer pipeline pure rules", () => {
  it("원문에 포함된 인용만 남긴다", () => {
    const result = verifyAnswerCitations(
      [
        { itemId: "item-1", quote: "확인된 문장" },
        { decisionId: "decision-1", quote: "없는 문장" },
      ],
      new Map([
        ["item-1", "확인된 문장입니다."],
        ["decision-1", "결정 원문"],
      ]),
    );

    expect(result).toEqual({
      valid: [{ itemId: "item-1", quote: "확인된 문장" }],
      dropped: 1,
    });
  });

  it("검색 결과를 모델 입력과 원문 맵으로 만든다", () => {
    const evidence = buildAnswerEvidence({
      items: [
        {
          id: "item-1",
          content: "공개 원문",
          source_kind: "slack_channel",
          source_title: "#공개",
          source_visibility: "dept",
        },
      ],
      decisions: [
        {
          id: "decision-1",
          outcome: "재입찰",
          rationale: "원칙에 따른다.",
        },
      ],
    });

    expect(evidence.texts.get("item-1")).toBe("공개 원문");
    expect(evidence.texts.get("decision-1")).toBe("재입찰\n원칙에 따른다.");
    expect(evidence.prompt).toEqual([{ evidence: 1, kind: "item", source: "#공개", occurred_at: null, paragraphs: [{ paragraph: 1, text: "공개 원문" }] }, { evidence: 2, kind: "decision", source: "결정 기록", occurred_at: null, paragraphs: [{ paragraph: 1, text: "재입찰\n원칙에 따른다." }] }]);
    for (const field of ["item-1", "decision-1", "content", "visibility"]) expect(JSON.stringify(evidence.prompt)).not.toContain(field);
  });
});
