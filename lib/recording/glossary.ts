export type GlossaryEntry = {
  term: string;
  reading: string | null;
  note: string | null;
  updated_at: string;
};

// A UTF-8 byte cap is conservative for the provider's 224-token prompt limit.
const MAX_PROMPT_BYTES = 224;

export function glossaryPrompt(rows: GlossaryEntry[]): {
  text: string;
  budgetUsed: number;
  included: number;
} {
  const ordered = [...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const row of ordered) {
    const term = row.term.trim();
    const key = term.toLocaleLowerCase("ko");
    if (!term || seen.has(key)) continue;
    seen.add(key);
    const reading = row.reading?.trim();
    const label = reading && reading !== term ? `${term}(${reading})` : term;
    const candidate = [...terms, label].join(", ");
    if (new TextEncoder().encode(candidate).length <= MAX_PROMPT_BYTES) terms.push(label);
  }
  const text = terms.join(", ");
  return { text, budgetUsed: new TextEncoder().encode(text).length, included: terms.length };
}

export function glossarySummaryInstruction(rows: GlossaryEntry[]): string {
  const { text } = glossaryPrompt(rows);
  return text ? `표기 기준 용어: ${text}. 원문의 인용 문자열은 바꾸지 마세요.` : "";
}
