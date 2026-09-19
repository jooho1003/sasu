import type { RetroActivity } from "@/lib/contracts";
import { localDate, normalizeActivity } from "../bundle";
export function collectMemory(files: { path: string; mtime: string; content: string }[], date: string, tz: string): RetroActivity[] {
  return files.flatMap(file => {
    if (!Number.isFinite(Date.parse(file.mtime)) || localDate(file.mtime, tz) !== date) return [];
    const front = file.content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
    const title = front?.match(/^name:\s*(.+)$/m)?.[1]?.replace(/^['"]|['"]$/g, "");
    const description = front?.match(/^description:\s*(.+)$/m)?.[1]?.replace(/^['"]|['"]$/g, "") ?? "";
    return title ? [normalizeActivity({ kind: "memory_change", ref: file.path, title, text: description, at: file.mtime, meta: {} })] : [];
  });
}
