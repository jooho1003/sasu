export type EvidenceSource = { kind: "item" | "decision"; id: string; text: string };
export type SelectionFailureCode = "empty" | "too_many" | "evidence_out_of_range" | "paragraph_out_of_range" | "range_reversed" | "duplicate_evidence";
export type ResolvedCitation = { itemId?: string; decisionId?: string; quote: string };

/** Offsets preserve the original separators, including CRLF, when selecting a range. */
export function paragraphSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const add = (start: number, end: number) => {
    const part = text.slice(start, end);
    const trimmed = part.trim();
    if (trimmed) {
      const offset = part.length - part.trimStart().length;
      spans.push({ start: start + offset, end: start + offset + trimmed.length });
    }
  };
  let start = 0;
  for (const match of text.matchAll(/\r?\n[\t ]*\r?\n/gu)) {
    add(start, match.index);
    start = match.index + match[0].length;
  }
  add(start, text.length);
  return spans;
}

/** Keep single line breaks: a condition and its conclusion may span lines. */
export function evidenceParagraphs(text: string): string[] {
  return paragraphSpans(text).map(span => text.slice(span.start, span.end));
}

export function isParagraphRange(text: string, quote: string): boolean {
  if (!quote) return false;
  const spans = paragraphSpans(text);
  const ends = new Set(spans.map(span => span.end));
  return spans.some(span => ends.has(span.start + quote.length) && text.startsWith(quote, span.start));
}

export function resolveSelections(
  selections: ReadonlyArray<{ evidence: number; first_paragraph: number; last_paragraph: number }>,
  sources: ReadonlyArray<EvidenceSource>,
): { ok: true; citations: ResolvedCitation[] } | { ok: false; failures: Array<{ selection: number; code: SelectionFailureCode }> } {
  const failures: Array<{ selection: number; code: SelectionFailureCode }> = [];
  const citations: ResolvedCitation[] = [];
  if (!selections.length) failures.push({ selection: 1, code: "empty" });
  if (selections.length > 8) failures.push({ selection: 9, code: "too_many" });
  const used = new Set<string>();
  selections.forEach((value, index) => {
    const fail = (code: SelectionFailureCode) => { failures.push({ selection: index + 1, code }); };
    if (!Number.isInteger(value.evidence) || value.evidence < 1 || value.evidence > sources.length) {
      fail("evidence_out_of_range");
      return;
    }
    const source = sources[value.evidence - 1];
    const key = `${source.kind}:${source.id}`;
    if (used.has(key)) fail("duplicate_evidence");
    used.add(key);
    const spans = paragraphSpans(source.text);
    const { first_paragraph: first, last_paragraph: last } = value;
    if (![first, last].every(n => Number.isInteger(n) && n >= 1 && n <= spans.length)) {
      fail("paragraph_out_of_range");
      return;
    }
    if (first > last) {
      fail("range_reversed");
      return;
    }
    citations.push({
      ...(source.kind === "item" ? { itemId: source.id } : { decisionId: source.id }),
      quote: source.text.slice(spans[first - 1].start, spans[last - 1].end),
    });
  });
  return failures.length ? { ok: false, failures } : { ok: true, citations };
}

export function answerLead(count: number): string {
  return `관련 부서 기록 ${count}개를 찾았습니다. 아래 원문을 확인해 주세요.`;
}
