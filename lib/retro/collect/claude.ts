import type { RetroActivity } from "@/lib/contracts";
import { localDate, normalizeActivity } from "../bundle";
// Select known scalar fields without materializing pastedContents/tool payloads.
function field(line: string, name: string): unknown {
  let depth = 0, key: string | null = null, expectKey = true;
  try {
    for (let index = 0; index < line.length; index++) {
      const char = line[index];
      if (char === '"') {
        const start = index++;
        for (; index < line.length; index++) {
          if (line[index] === "\\") { index++; continue; }
          if (line[index] === '"') break;
        }
        if (depth !== 1) continue;
        if (expectKey) { key = JSON.parse(line.slice(start, index + 1)); expectKey = false; }
        else if (key === name) return JSON.parse(line.slice(start, index + 1));
      } else if (char === "{" || char === "[") depth++;
      else if (char === "}" || char === "]") depth--;
      else if (char === "," && depth === 1) { expectKey = true; key = null; }
      else if (depth === 1 && key === name && /[0-9]/.test(char)) {
        return Number(line.slice(index).match(/^[0-9]+/)?.[0]);
      }
    }
  } catch { /* Malformed scalar fields are ignored; nested values are never parsed. */ }
  return null;
}
export function collectClaude(history: string[], sessions: string[], date: string, tz: string, fileModifiedAt?: string): RetroActivity[] {
  const rows: RetroActivity[] = [];
  for (const line of history) {
    const timestamp = field(line, "timestamp"), display = field(line, "display"), session = field(line, "sessionId");
    if (typeof timestamp !== "number" || typeof display !== "string" || typeof session !== "string") continue;
    const at = new Date(timestamp).toISOString(); if (localDate(at, tz) !== date) continue;
    const title = display.split(/\r?\n/)[0].replace(/\[Pasted text[^\]]*\]/g, "").trim();
    if (title) rows.push(normalizeActivity({ kind: "claude_prompt", ref: `${session}:${timestamp}`, at, title, text: "", meta: {} }));
  }
  for (const line of sessions) {
    if (field(line, "type") !== "ai-title") continue;
    const title = field(line, "aiTitle"), session = field(line, "sessionId"), timestamp = field(line, "timestamp") ?? fileModifiedAt;
    if (typeof title !== "string" || typeof session !== "string" || typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp)) || localDate(timestamp, tz) !== date) continue;
    rows.push(normalizeActivity({ kind: "claude_session", ref: session, title, at: new Date(timestamp).toISOString(), text: "", meta: {} }));
  }
  return rows;
}
