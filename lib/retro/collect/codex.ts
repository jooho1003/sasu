import type { RetroActivity } from "@/lib/contracts";
import { localDate, normalizeActivity } from "../bundle";
export function collectCodex(lines: string[], session: string, date: string, tz: string): RetroActivity[] {
  for (const line of lines) {
    if (!/"type"\s*:\s*"(user_message|message)"/.test(line) || /"role"\s*:\s*"(assistant|developer|system)"/.test(line)) continue;
    try {
      const record = JSON.parse(line);
      const p = record.payload;
      const input = p?.type === "user_message" ? p.message : p?.role === "user" ? p.content?.filter((c: { type: string }) => c.type === "input_text").map((c: { text: string }) => c.text).join("\n") : null;
      if (typeof input !== "string" || /^\s*(# AGENTS\.md|<environment_context>|<INSTRUCTIONS>)/.test(input)) continue;
      if (!Number.isFinite(Date.parse(record.timestamp)) || localDate(record.timestamp, tz) !== date) continue;
      const title = input.split(/\r?\n/)[0].trim();
      if (title) return [normalizeActivity({ kind: "codex_session", ref: session, title, text: "", at: new Date(record.timestamp).toISOString(), meta: {} })];
    } catch { /* Ignore incomplete/unknown log records. */ }
  }
  return [];
}
