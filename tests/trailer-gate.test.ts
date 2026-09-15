import { describe, expect, it } from "vitest";
import fixture from "./fixtures/trailer-approval.json";
import { TrailerScenario } from "@/lib/contracts";
import { runTrailerGate, trailerApprovalItems, trailerTextFields } from "@/lib/trailer-gate";

const scenarios = () => TrailerScenario.array().parse(structuredClone(fixture.scenarios));
describe("예고편 결정적 발행 검사", () => {
  it("형식 오류는 문제가 있는 입력란의 경로만 반환한다",()=>{const data=scenarios();data[0].title="";expect(runTrailerGate(data,{sourceTexts:[],properNouns:[]}).violations).toContainEqual({path:"scenarios[0].title",rule:"schema"});});
  it("공개 텍스트 필드 전부와 SQL과 같은 승인 항목을 열거한다", () => {
    const fields = trailerTextFields(scenarios());
    for (const path of ["scenarios[0].title", "scenarios[0].facts[0].label", "scenarios[0].facts[0].text", "scenarios[0].dialogues[0].question", "scenarios[0].dialogues[0].quote", "scenarios[0].choices[0].label", "scenarios[0].ending.quote"]) expect(fields.some((field) => field.path === path)).toBe(true);
    expect(trailerApprovalItems(scenarios()).map((item) => item.id)).toEqual(fixture.expected_item_ids);
  });
  it.each([19, 20])("연속 동일 구간 %i자의 경계를 확인한다", (length) => {
    const data = scenarios(); data[0].title = "가".repeat(length);
    const result = runTrailerGate(data, { sourceTexts: ["가".repeat(20)], properNouns: [] });
    expect(result.passed).toBe(length === 19);
    if (length === 20) expect(result.violations).toContainEqual({ path: "scenarios[0].title", rule: "overlap" });
  });
  it("공백 정규화 후 겹침을 검사하고 결과에 원문을 넣지 않는다", () => {
    const data = scenarios(); data[0].title = "하나 둘 셋 넷 다섯 여섯 일곱 여덟 아홉";
    const result = runTrailerGate(data, { sourceTexts: [data[0].title.replaceAll(" ", " \n  ")], properNouns: [] });
    expect(result.passed).toBe(false);
    expect(JSON.stringify(result)).not.toContain("하나");
    expect(Object.keys(result.violations[0]).sort()).toEqual(["path", "rule"]);
  });
  it("고유명사는 라틴 대소문자를 무시하고 한 글자는 제외한다", () => {
    const data = scenarios(); data[0].title = "Acme와 협의";
    expect(runTrailerGate(data, { sourceTexts: [], properNouns: ["acme"] }).violations).toContainEqual({ path: "scenarios[0].title", rule: "proper_noun" });
    expect(runTrailerGate(data, { sourceTexts: [], properNouns: ["와"] }).passed).toBe(true);
  });
  it.each(["test@example.com", "010-1234-5678"])("마스킹 대상 %s를 공개하지 않는다", (text) => {
    const data = scenarios(); data[0].title = text;
    expect(runTrailerGate(data, { sourceTexts: [], properNouns: [] }).violations).toContainEqual({ path: "scenarios[0].title", rule: "mask" });
  });
  it("인용 불일치·중복 시나리오·잘못된 배열은 스키마 위반으로 끝낸다", () => {
    const data = scenarios(); data[0].ending.quote = "없는 원문";
    for (const input of [null, [], [data[0]], [scenarios()[0], scenarios()[0]]]) {
      const result = runTrailerGate(input, { sourceTexts: ["없는 원문"], properNouns: ["원문"] });
      expect(result.passed).toBe(false);
      expect(result.violations.every((violation) => violation.rule === "schema")).toBe(true);
    }
  });
});
