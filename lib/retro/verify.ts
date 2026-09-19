import { type RetroBody, type RetroDraft } from "@/lib/contracts";
import { mask } from "@/lib/mask";
import { isDeptContext } from "@/lib/retro/presets";
export const RETRO_SECTIONS = ["did", "learned", "decided", "next"] as const;
export type EvidenceActivity = {
  id: string;
  kind?: string;
  meta?: Record<string, unknown>;
  title: string;
  text: string;
  excluded: boolean;
};
export function verifyRetroDraft(
  draft: RetroDraft,
  activities: EvidenceActivity[],
) {
  const sources = new Map(
    activities.filter((a) => !a.excluded).map((a) => [a.id, a]),
  );
  const validCitation = (c: RetroDraft["citations"][number]) => {
    const source = sources.get(c.activity_id);
    return (
      !!source &&
      !isDeptContext(source.kind ?? "", source.meta ?? {}) &&
      !!c.quote.trim() &&
      (source.title.includes(c.quote) || source.text.includes(c.quote))
    );
  };
  let dropped = 0,
    count = 0;
  const body = Object.fromEntries(
    RETRO_SECTIONS.map((section) => [
      section,
      draft.body[section].flatMap((item) => {
        const citations = item.citations.filter(validCitation);
        const maskedText =
          /\[(이메일|전화번호|계좌번호|주민번호|카드번호)\]/.test(
            mask(item.text),
          );
        const calendar = citations.some(
          (c) => sources.get(c.activity_id)?.kind === "calendar_event",
        );
        const schedule =
          /(?:일정|계획)/.test(item.text) &&
          /(?:확인|비교)(?:했습니다|했다)\.?$/.test(item.text.trim()) &&
          !/(?:참석|진행|완료|만났|면담|합의|결정|인터뷰|참여)/.test(item.text);
        const metric = citations.some(
          (c) => sources.get(c.activity_id)?.kind === "metric_snapshot",
        );
        // A metric can support only an observation, never personal attribution.
        const observation =
          /(?:확인|비교)(?:했습니다|했다)\.?$/.test(item.text.trim()) &&
          !/(?:높였|늘렸|달성|개선|성과|기여|증가시|감소시|확인하고|비교하고)/.test(
            item.text,
          );
        if (
          !citations.length ||
          maskedText ||
          (calendar && (section !== "did" || !schedule)) ||
          (metric && (section !== "did" || !observation)) ||
          count >= 200
        ) {
          dropped++;
          return [];
        }
        count++;
        return [{ text: mask(item.text), citations }];
      }),
    ]),
  ) as RetroBody;
  const cited = new Set(
    RETRO_SECTIONS.flatMap((s) =>
      body[s].flatMap((i) => i.citations.map((c) => c.activity_id)),
    ),
  );
  const citations = draft.citations.filter(
    (c) => validCitation(c) && cited.has(c.activity_id),
  );
  return {
    title: mask(draft.title).slice(0, 60),
    body,
    citations,
    highlight:
      draft.highlight && citations.length ? mask(draft.highlight) : null,
    topics: draft.topics.map(mask).slice(0, 5),
    dropped,
    valid: count > 0,
  };
}
