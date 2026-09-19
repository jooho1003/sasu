import { type RetroBody, type RetroDraft } from "@/lib/contracts";
import { mask } from "@/lib/mask";
import { isDeptContext } from "@/lib/retro/presets";
export const RETRO_SECTIONS = ["did", "learned", "decided", "next"] as const;
export type EvidenceActivity = { id: string; kind?: string; meta?: Record<string, unknown>; title: string; text: string; excluded: boolean };
export function verifyRetroDraft(draft: RetroDraft, activities: EvidenceActivity[]) {
  const sources = new Map(activities.filter(a => !a.excluded).map(a => [a.id, a]));
  const validCitation = (c: RetroDraft["citations"][number]) => {
    const source = sources.get(c.activity_id);
    return !!source && !isDeptContext(source.kind ?? "", source.meta ?? {}) && !!c.quote.trim() && (source.title.includes(c.quote) || source.text.includes(c.quote));
  };
  let dropped = 0, count = 0;
  const body = Object.fromEntries(RETRO_SECTIONS.map(section => [section, draft.body[section].flatMap(item => {
    const citations = item.citations.filter(validCitation);
    const sourceIds = new Set(citations.map(c => c.activity_id));
    const hasMaskedSource = [...sourceIds].some(id => {
      const source = sources.get(id);
      return !!source && /\[(이메일|전화번호|계좌번호|주민번호|카드번호)\]/.test(source.text);
    });
    if (!citations.length || hasMaskedSource || count >= 200) { dropped++; return []; }
    count++;
    return [{ text: mask(item.text), citations }];
  })])) as RetroBody;
  const cited = new Set(RETRO_SECTIONS.flatMap(s => body[s].flatMap(i => i.citations.map(c => c.activity_id))));
  const citations = draft.citations.filter(c => validCitation(c) && cited.has(c.activity_id));
  return { title: mask(draft.title).slice(0, 60), body, citations, highlight: draft.highlight && citations.length ? mask(draft.highlight) : null, topics: draft.topics.map(mask).slice(0, 5), dropped, valid: count > 0 };
}
