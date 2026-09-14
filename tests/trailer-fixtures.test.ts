import { describe, expect, it } from "vitest";
import { trailerScenarios } from "@/fixtures/trailer/scenarios";
import { validateScenario } from "@/lib/trailer";

describe("합성 체험 콘텐츠", () => {
  it("독립된 3퀘스트와 모든 응답·기록실 인용이 유효하다", () => {
    expect(trailerScenarios).toHaveLength(3);
    expect(new Set(trailerScenarios.map((scenario) => scenario.id)).size).toBe(3);
    for (const input of trailerScenarios) {
      const scenario = validateScenario(input);
      expect(new Set(scenario.facts.map((fact) => fact.place)).size).toBe(5);
      for (const place of ["finance", "partner"]) {
        expect(scenario.dialogues.some((entry) => entry.place === place)).toBe(true);
      }
    }
  });
});
