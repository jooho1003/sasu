import { describe, expect, it } from "vitest";
import { closestDemoAnswer, salesDemoRecords } from "@/lib/demo-workspace";

describe("공개 데모 기록과 질문", () => {
  it("띄어쓰기·대소문자·문장부호가 달라도 B 견적을 선택한다", () => {
    const answers = [{ id: "wrong", question: "팀 원칙은?", answer: "기록합니다", quotes: ["기록"] }, { id: "vendor", question: "외주사 B 견적은 어떻게 됐나요?", answer: "12% 인상", quotes: ["12%"] }];
    expect(closestDemoAnswer("외주사 b견적은?", answers)?.id).toBe("vendor");
    expect(closestDemoAnswer("완전히 무관한 날씨", answers)).toBeNull();
    expect(closestDemoAnswer("외주사", [{ ...answers[1], quotes: [] }])).toBeNull();
  });
  it("영업의 여러 문서·회의에 다수의 결정과 검증 가능한 근거를 제공한다", () => {
    const { sources, items, decisions } = salesDemoRecords;
    expect(items.length).toBeGreaterThanOrEqual(60);
    expect(new Set(items.map(item => item.id)).size).toBe(items.length);
    for (const kind of ["slack_channel", "meeting", "document"]) {
      expect(items.filter(item => sources.some(source => source.id === item.source_id && source.kind === kind)).length).toBeGreaterThanOrEqual(16);
    }
    expect(decisions.some(row => row.status === "deferred")).toBe(true);
    expect(decisions.filter(row => row.source_id === "sales-meeting-1").length).toBeGreaterThan(1);
    for (const row of decisions) expect(items.some(item => item.source_id === row.source_id && item.content.includes(row.quote))).toBe(true);
  });
});
