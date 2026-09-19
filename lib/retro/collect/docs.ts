import type { RetroActivity } from "@/lib/contracts";
import { normalizeActivity } from "../bundle";
export function collectDocs(stat: string, before: string[], after: string[], at: string): RetroActivity[] {
  const rows: RetroActivity[] = [];
  for (const line of stat.split(/\r?\n/)) {
    const columns = line.split("\t");
    if (columns.length !== 3) continue;
    const numericFirst = /^\d+$/.test(columns[0]);
    const [path, insertions, deletions] = numericFirst ? [columns[2], columns[0], columns[1]] : columns;
    if (!/^\d+$/.test(insertions) || !/^\d+$/.test(deletions)) continue;
    rows.push(normalizeActivity({ kind: "doc_change", ref: path, title: path, text: "", at, meta: { insertions: Number(insertions), deletions: Number(deletions) } }));
  }
  for (const title of after.filter(h => !before.includes(h) && /^### ADR-\d+:/.test(h))) rows.push(normalizeActivity({ kind: "doc_change", ref: `adr:${title.match(/ADR-(\d+)/)![1]}`, title, text: "", at, meta: {} }));
  return rows;
}
