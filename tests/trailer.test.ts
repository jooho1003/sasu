import { describe, expect, it } from "vitest";
import { TrailerScenario } from "@/lib/contracts";
import { validateScenario, validateSubmission } from "@/lib/trailer";

const scenario = {
  id: "sample", title: "단가 협상", summary: "인상 요청을 검토하세요.",
  facts: [{ id: "rule", place: "library", label: "원칙", text: "인상률이 10% 이상이면 재입찰을 검토한다." }],
  dialogues: [{ id: "budget", place: "finance", question: "검토 기준은요?", fact_id: "rule", quote: "10% 이상이면 재입찰을 검토한다." }],
  choices: [{ id: "accept", label: "수용" }, { id: "review", label: "재입찰 검토" }],
  ending: { choice_id: "review", fact_id: "rule", quote: "인상률이 10% 이상이면 재입찰을 검토한다." },
};

describe("채용 예고편 사실집 경계", () => {
  it("모든 응답과 기록실의 인용을 검증한다", () => {
    expect(validateScenario(scenario)).toEqual(scenario);
  });
  it.each(["missing", "forged"])("없는 사실 또는 위조 인용을 차단한다: %s", (kind) => {
    const invalid = structuredClone(scenario);
    if (kind === "missing") invalid.dialogues[0].fact_id = "secret";
    else invalid.dialogues[0].quote = "전액 수용해도 됩니다.";
    expect(() => validateScenario(invalid)).toThrow();
  });
  it("기록실의 인용과 선택도 검증한다", () => {
    expect(() => validateScenario({ ...scenario, ending: { ...scenario.ending, quote: "없는 결정 이유" } })).toThrow();
    expect(() => validateScenario({ ...scenario, ending: { ...scenario.ending, choice_id: "unknown" } })).toThrow();
  });
  it.each(["facts", "dialogues", "choices"] as const)("중복 ID를 거부한다: %s", (key) => {
    expect(() => validateScenario({ ...scenario, [key]: [...scenario[key], scenario[key][0]] })).toThrow();
  });
  it("공백 인용과 계약에 없는 내부 필드를 거부한다", () => {
    expect(() => validateScenario({ ...scenario, ending: { ...scenario.ending, quote: " " } })).toThrow();
    expect(TrailerScenario.safeParse({ ...scenario, dept_id: "internal" }).success).toBe(false);
  });
});

describe("공개 체험의 결정 작성", () => {
  const input = { choice_id: "accept", reason: "  거래 관계를 고려했습니다.  ", fact_ids: ["rule"] };
  it("사례와 다른 결정도 허용하고 이유의 앞뒤 공백을 정리한다", () => {
    expect(validateSubmission(validateScenario(scenario), ["rule"], input)).toEqual({ ...input, reason: "거래 관계를 고려했습니다." });
  });
  it.each([
    { choice_id: "unknown" }, { reason: "  " }, { reason: "가".repeat(1001) },
    { fact_ids: [] }, { fact_ids: ["secret"] }, { fact_ids: ["rule", "rule"] },
  ])("선택·이유·근거 오류를 거부한다: %j", (change) => {
    expect(validateSubmission(validateScenario(scenario), ["rule"], { ...input, ...change })).toBeNull();
  });
  it("확인하지 않은 단서는 제출 근거로 사용할 수 없다", () => {
    expect(validateSubmission(validateScenario(scenario), [], input)).toBeNull();
  });
});
