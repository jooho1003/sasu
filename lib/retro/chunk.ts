import type { RetroDraft } from "@/lib/contracts";
export function chunkRetroActivities<T extends { kind: string; at: string }>(activities: T[], limit = 120): T[][] {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("invalid_chunk_limit");
  const rows = [...activities].sort((a, b) => a.kind.localeCompare(b.kind) || a.at.localeCompare(b.at));
  return Array.from({ length: Math.ceil(rows.length / limit) }, (_, i) => rows.slice(i * limit, (i + 1) * limit));
}
export function mergeRetroDrafts(parts: RetroDraft[]): RetroDraft {
  const frequencies = new Map<string, number>();
  parts.forEach(p => p.topics.forEach(t => frequencies.set(t, (frequencies.get(t) ?? 0) + 1)));
  return { title: parts[0]?.title ?? "오늘의 회고", highlight: parts.find(p => p.highlight)?.highlight ?? null, topics: [...frequencies].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t), citations: parts.flatMap(p => p.citations).slice(0, 200), body: { did: parts.flatMap(p => p.body.did), learned: parts.flatMap(p => p.body.learned), decided: parts.flatMap(p => p.body.decided), next: parts.flatMap(p => p.body.next) } };
}
