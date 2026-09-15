import { describe, expect, it } from "vitest";
import { AgentRoleCriterion, TrailerGenerationDraft, toStrictJsonSchema } from "@/lib/contracts";
import { buildTrailerGeneratePrompt, DEFAULT_TRAILER_RUBRIC, draftToScenario, selectPrincipleText } from "@/lib/trailer-generation";
import { validateScenario } from "@/lib/trailer";
import fixture from "./fixtures/trailer-approval.json";

describe("예고편 생성 입력 경계", () => {
  it("기준표 4개와 12000자 원칙 상한을 유지한다", () => {
    expect(AgentRoleCriterion.array().parse(DEFAULT_TRAILER_RUBRIC)).toHaveLength(4);
    expect(DEFAULT_TRAILER_RUBRIC.map((item) => item.key)).toEqual(["principle_check", "stakeholder_check", "tradeoff", "decision_clarity"]);
    expect(selectPrincipleText(["가".repeat(8000), "나".repeat(8000)])).toHaveLength(12000);
    expect(selectPrincipleText(["first", "second"], 5)).toBe("first");
  });
  it("허용된 입력 텍스트를 전부 마스킹하고 오류는 코드만 포함한다", () => {
    const prompt = buildTrailerGeneratePrompt({ scenarioId: "scenario_1", decision: { outcome: "문의 test@example.com", rationale: "연락 010-1234-5678" }, cardTitle: "secret@example.com", principles: "owner@example.com", previousErrorCode: "invalid_scenario" });
    for (const raw of ["test@example.com", "010-1234-5678", "secret@example.com", "owner@example.com"]) expect(prompt.user).not.toContain(raw);
    expect(prompt.user).toContain("invalid_scenario"); expect(prompt.system).toContain("20자");
    expect(prompt.system).toContain("quote");
  });
  it("생성 계약은 엄격한 객체이고 id는 코드가 정하며 인용 무결성을 검증할 수 있다", () => {
    const draft = TrailerGenerationDraft.parse(fixture.scenarios[0]);
    expect(validateScenario(draftToScenario("scenario_1", draft)).id).toBe("scenario_1");
    const schema = toStrictJsonSchema("TrailerGeneration", TrailerGenerationDraft) as { additionalProperties?: boolean; required: string[] };
    expect(schema.additionalProperties).toBe(false); expect(schema.required).toContain("ending");
  });
});
