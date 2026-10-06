import type { DocumentSummary } from "@/lib/contracts";

// 문서 요약을 원문 문자열로 검증하는 순수 함수. 파이프라인(저장 전)과 게스트 데모(렌더 전)가 같이 쓴다 (ADR-090·091).
// LLM·job·DB 의존을 두지 않는다.

export type SummaryGroup = Exclude<keyof DocumentSummary, "citations" | "overview">;

export type VerifiedDocumentSummary = {
  valid: DocumentSummary;
  dropped: number;
};

export function sectionKey(group: SummaryGroup, itemId: string, text: string): string {
  return JSON.stringify([group, itemId, text]);
}

const EMPTY_OVERVIEW = "요약할 내용을 찾지 못했습니다.";

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function groundedOverview(
  overview: string,
  sourceTexts: string[],
  validItems: Array<{ text: string }>,
): { text: string; replaced: boolean } {
  const sources = sourceTexts.map(normalizeText);
  const sentences = overview
    .split(/(?<=[.!?。])\s+|\n+/)
    .map(normalizeText)
    .filter((sentence) => sentence.length > 0);
  if (sentences.length > 0 && sentences.every((sentence) => sources.some((source) => source.includes(sentence)))) {
    return { text: overview, replaced: false };
  }
  const fallback = validItems.slice(0, 2).map((entry) => entry.text).join(" ");
  return { text: fallback || EMPTY_OVERVIEW, replaced: true };
}

export function verifyDocumentSummary(
  summary: DocumentSummary,
  items: Map<string, string>,
): VerifiedDocumentSummary {
  let dropped = 0;
  const validCitations = summary.citations.filter((citation) => {
    if (citation.item_id === null || citation.decision_id !== null) {
      dropped += 1;
      return false;
    }
    const source = items.get(citation.item_id);
    if (!source || !source.includes(citation.quote)) {
      dropped += 1;
      return false;
    }
    return true;
  });

  const valid = {
    citations: validCitations,
    overview: "",
    key_points: [],
    decisions: [],
    actions: [],
    open_questions: [],
  } as DocumentSummary;

  const seen = new Set<string>();
  for (const group of ["key_points", "decisions", "actions", "open_questions"] as SummaryGroup[]) {
    valid[group] = summary[group].flatMap((entry) => {
      const source = items.get(entry.item_id);
      const key = sectionKey(group, entry.item_id, entry.text);
      if (!source || !source.includes(entry.text) || seen.has(key)) {
        dropped += 1;
        return [];
      }
      seen.add(key);
      return [entry];
    });
  }

  const overview = groundedOverview(
    summary.overview,
    [...items.values()],
    [...valid.key_points, ...valid.decisions, ...valid.actions],
  );
  valid.overview = overview.text;
  if (overview.replaced) dropped += 1;

  return { valid, dropped };
}
