import type { RetroActivity } from "@/lib/contracts";
import { normalizeActivity } from "../bundle";
export function collectGit(output: string, repo: string): RetroActivity[] {
  const rows: RetroActivity[] = [];
  for (const line of output.split(/\r?\n/)) {
    const [ref, at, title] = line.split("\u001f");
    if (title && Number.isFinite(Date.parse(at))) rows.push(normalizeActivity({ kind: "git_commit", ref, at, title, text: "", meta: { repo, files: 0, insertions: 0, deletions: 0 } }));
    else if (rows.length && /files? changed/.test(line)) Object.assign(rows.at(-1)!.meta, { files: Number(line.match(/(\d+) files? changed/)?.[1] ?? 0), insertions: Number(line.match(/(\d+) insertions?/)?.[1] ?? 0), deletions: Number(line.match(/(\d+) deletions?/)?.[1] ?? 0) });
  }
  return rows;
}
