import { describe, expect, it } from "vitest";
import { acceptanceForAccuracy, characterErrorRate, classificationScores, lowConfidenceRecall, validateAccuracyEvidence } from "@/lib/recording/accuracy";

describe("recording accuracy measurement", () => {
  it("counts substitutions, insertions and deletions by Unicode character", () => {
    expect(characterErrorRate("가 나 다", "가 다")).toBeCloseTo(1 / 3);
    expect(characterErrorRate("가나다", "가나다라")).toBeCloseTo(1 / 3);
    expect(characterErrorRate("e\u0301", "é")).toBe(0);
  });

  it("scores labeled decision candidates with unique IDs", () => {
    expect(classificationScores(["a", "b"], ["a", "c", "c"])).toEqual({ precision: 0.5, recall: 0.5, truePositives: 1 });
  });

  it("measures how many erroneous sections were flagged", () => {
    expect(lowConfidenceRecall([{ error: true, flagged: true }, { error: true, flagged: false }, { error: false, flagged: true }])).toBe(0.5);
    expect(lowConfidenceRecall([{ error: false, flagged: false }])).toBeNull();
  });

  it("refuses to certify a partial or untraceable device measurement", () => {
    const result = validateAccuracyEvidence({ trials: [], meetings: [] });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("six_mode_comparisons_required");
  });

  it("checks each mode for lower term error, no overall regression and half the errors flagged", () => {
    const trials = ["microphone", "tab", "system"].flatMap((mode) => [
      { mode, glossary: "before", cer: 0.2, termCer: 0.3, lowConfidenceRecall: 0.6 },
      { mode, glossary: "after", cer: mode === "tab" ? 0.21 : 0.2, termCer: 0.2, lowConfidenceRecall: 0.6 },
    ]);
    expect(acceptanceForAccuracy(trials).passed).toBe(false);
    expect(acceptanceForAccuracy(trials).failures).toContain("tab_overall_cer_regressed");
  });
});
