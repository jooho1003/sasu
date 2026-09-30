import { describe, expect, it } from "vitest";
import { glossaryPrompt, glossarySummaryInstruction } from "@/lib/recording/glossary";

const rows = [
  { term: "사수", reading: "사수", note: "결정 지원 서비스", updated_at: "2026-09-29T00:00:00Z" },
  { term: "원칙", reading: null, note: null, updated_at: "2026-09-28T00:00:00Z" },
];

describe("department glossary prompt", () => {
  it("keeps newer terms first within the conservative 224-token budget", () => {
    const prompt = glossaryPrompt([...rows, { term: "가".repeat(300), reading: null, note: null, updated_at: "2026-09-27T00:00:00Z" }]);
    expect(prompt.text).toContain("사수");
    expect(prompt.text).toContain("원칙");
    expect(prompt.text).not.toContain("가".repeat(300));
    expect(prompt.budgetUsed).toBeLessThanOrEqual(224);
    expect(prompt.included).toBe(2);
  });

  it("does not repeat case-insensitive duplicate terms or put notes in speech prompt", () => {
    const prompt = glossaryPrompt([...rows, { term: "사수", reading: null, note: "중복", updated_at: "2026-09-27T00:00:00Z" }]);
    expect(prompt.included).toBe(2);
    expect(prompt.text).not.toContain("결정 지원 서비스");
  });

  it("provides the same selected terms to document summary", () => {
    expect(glossarySummaryInstruction(rows)).toContain("사수");
    expect(glossarySummaryInstruction(rows)).toContain("원칙");
    expect(glossarySummaryInstruction([])).toBe("");
  });
});
