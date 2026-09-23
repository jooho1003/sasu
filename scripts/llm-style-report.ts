import { checkStrings, type Term } from "../lib/wording-check";

export function measureStyle(purpose: string, data: Record<string, unknown>, terms: Term[]) {
  // ADR-066: answer text is copied evidence, never newly authored prose.
  if (purpose === "answer") return { styleApplicable: false, sentenceCount: 0, over40: 0, wrongEnding: 0, findings: [], violates: null };
  const keys = purpose === "make_card" ? ["title", "background", "recommendation"] : ["overview"];
  if (keys.some(key => typeof data[key] !== "string" || !String(data[key]).trim())) throw Error("style_fields_missing");
  const texts = keys.map(key => ({ key, text: data[key] as string }));
  const findings = texts.flatMap(({ key, text }) => checkStrings([{ line: 1, text, context: "literal" }], terms, { file: "<text>", styleExempt: false })
    .map(f => ({ field: key, kind: f.kind, blocking: f.blocking,
      // Only allow a static dictionary replacement, never matched/generated text.
      ...(f.kind === "banned" && terms.some(term => term.replacement === f.suggestion) ? { rule: f.suggestion } : {}),
    })));
  const sentences = texts.flatMap(({ key, text }) => key === "title" ? [] : text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean));
  const over40 = sentences.filter(s => s.length > 40).length;
  const wrongEnding = sentences.filter(s => !/(?:습니다|합니다|세요|입니다|됩니다|있습니다|없습니다)[.!?]?$/.test(s)).length;
  return { styleApplicable: true, findings, sentenceCount: sentences.length, over40, wrongEnding, violates: findings.some(f => f.blocking) || over40 > 0 || wrongEnding > 0 };
}

export function summarizeSamples(records: { status: string; styleApplicable?: boolean; violates?: boolean | null }[]) {
  const generated = records.filter(r => r.status === "generated");
  const measured = generated.filter(r => r.styleApplicable);
  const violations = measured.filter(r => r.violates).length;
  return { generated: generated.length, expectedRefusals: records.filter(r => r.status === "refused").length,
    styleEvaluated: measured.length, violations, violationRate: measured.length ? violations / measured.length : null,
    complianceRate: measured.length ? (measured.length - violations) / measured.length : null };
}
