import type { RetroBody } from "@/lib/contracts";
import { RETRO_SECTIONS, verifyRetroDraft, type EvidenceActivity } from "./verify";
type ExportActivity = EvidenceActivity & { kind: string; at: string; meta: Record<string, unknown>; ref?: string };
export function retroMarkdown(day: { retro_date: string; tz: string; author?: string }, revision: { title: string; body: RetroBody; topics: string[]; highlight?: string | null; citations?: { activity_id: string; quote: string }[] }, activities: ExportActivity[]): string {
  const verified = verifyRetroDraft({ ...revision, highlight: revision.highlight ?? null, citations: revision.citations ?? [], topics: revision.topics }, activities.map(a => ({ ...a, excluded: false })));
  const escape = (s: string) => s.replace(/[\\`*_[\]<>#]/g, "\\$&").replace(/\r?\n/g, " ");
  const refs = new Map<string, number>(), footnotes: string[] = [];
  const lines = [`# ${escape(verified.title)}`, "", `${day.retro_date}${day.author ? ` · ${escape(day.author)}` : ""}`, ""];
  if (verified.highlight) lines.push(escape(verified.highlight), "");
  const labels = { did: "한 일", learned: "배운 것·찾아본 것", decided: "결정·판단", next: "내일·미결" };
  for (const section of RETRO_SECTIONS) {
    lines.push(`## ${labels[section]}`, "");
    for (const item of verified.body[section]) {
      const citations = item.citations.map(c => {
        if (!refs.has(c.activity_id)) {
          const n = refs.size + 1; refs.set(c.activity_id, n);
          const a = activities.find(a => a.id === c.activity_id)!;
          const title = a.kind === "web_visit" ? String(a.meta.domain ?? "웹 문서") : a.title;
          const time = new Intl.DateTimeFormat("ko-KR", { timeZone: day.tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(a.at));
          footnotes.push(`[^A${n}]: ${a.kind} · ${escape(title)} · ${time}`);
        }
        return `[^A${refs.get(c.activity_id)}]`;
      }).join("");
      lines.push(`- ${escape(item.text)} ${citations}`);
    }
    lines.push("");
  }
  return [...lines, ...footnotes, ""].join("\n");
}
