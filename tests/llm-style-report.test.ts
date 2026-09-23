import { describe, expect, it } from "vitest";
import { measureStyle, summarizeSamples } from "../scripts/llm-style-report";

describe("실제 모델 문체 측정", () => {
  it("금지어 원문 대신 고정 사전의 대체어만 진단에 남긴다", () => {
    const terms = [{ term: "보류", replacement: "미루기", reason: "고정 사전", allow_in: [] }];
    const result = measureStyle("make_card", { title: "계약 보류", background: "고객 원문을 확인했습니다.", recommendation: "먼저 확인하세요." }, terms);
    expect(result.findings).toContainEqual({ field: "title", kind: "banned", blocking: true, rule: "미루기" });
    expect(JSON.stringify(result)).not.toMatch(/계약|고객 원문|보류/);
  });
  it("생성 문장과 인용 원문을 결과에 저장하지 않는다", () => {
    const result = measureStyle("make_card", {
      title: "검토 요청",
      background: "비공개 사례를 확인했습니다.",
      recommendation: "다음 순서를 정하세요.",
      citations: [{ quote: "원문은 어려운 영어 API를 포함한다" }],
    }, []);
    expect(result).toMatchObject({ styleApplicable: true, sentenceCount: 2, violates: false });
    expect(JSON.stringify(result)).not.toMatch(/비공개|다음 순서|원문은|API/);
  });
  it("현재 답변은 원문 선택이므로 문체 준수율에 포함하지 않는다", () => {
    expect(measureStyle("answer", { citations: [{ quote: "API 산정 원문" }] }, []))
      .toMatchObject({ styleApplicable: false, sentenceCount: 0, violates: null });
  });
  it("요약 인용 목록은 제외하고 새로 쓴 overview만 측정한다", () => {
    expect(measureStyle("summarize_document", {
      overview: "검토를 마쳤습니다.", key_points: [{ text: "API 산정" }],
    }, [])).toMatchObject({ sentenceCount: 1, violates: false });
  });
  it("긴 문장과 반말을 놓치지 않는다", () => {
    expect(measureStyle("make_card", { title: "검토", background: "가".repeat(41) + ".", recommendation: "끝났어." }, []))
      .toMatchObject({ over40: 1, wrongEnding: 2, violates: true });
  });
  it("측정 필드가 없으면 빈 문장을 준수로 세지 않는다", () => {
    expect(() => measureStyle("make_card", {}, [])).toThrow("style_fields_missing");
  });
  it("거절·실패·원문 선택을 문체 준수 분모에 섞지 않는다", () => {
    expect(summarizeSamples([
      { status: "generated", styleApplicable: true, violates: false },
      { status: "generated", styleApplicable: true, violates: true },
      { status: "generated", styleApplicable: false, violates: null },
      { status: "refused" }, { status: "failed" },
    ])).toMatchObject({ generated: 3, expectedRefusals: 1, styleEvaluated: 2, violations: 1, violationRate: 0.5, complianceRate: 0.5 });
    expect(summarizeSamples([{ status: "failed" }]).complianceRate).toBeNull();
  });
});
