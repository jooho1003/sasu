import type { RetroActivity } from "@/lib/contracts";
import { localDate, normalizeActivity } from "@/lib/retro/bundle";

export type Row = Record<string, unknown>;
export const record = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
export const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? (value.filter(
        (v) => v && typeof v === "object" && !Array.isArray(v),
      ) as Row[])
    : [];
export const str = (value: unknown): string =>
  typeof value === "string"
    ? value
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : "";
const stamp = (value: unknown): string => {
  const s = str(value);
  return s && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : "";
};
export function dayWindow(date: string, tz: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("invalid_date");
  const midnight = (utc: number) => {
    let value = utc;
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    for (let i = 0; i < 3; i++) {
      const p = Object.fromEntries(
        formatter.formatToParts(new Date(value)).map((x) => [x.type, x.value]),
      );
      const local = Date.UTC(
        Number(p.year),
        Number(p.month) - 1,
        Number(p.day),
        Number(p.hour),
        Number(p.minute),
        Number(p.second),
      );
      value = utc - (local - value);
    }
    return new Date(value).toISOString();
  };
  const utc = Date.parse(date + "T00:00:00Z");
  return { from: midnight(utc), to: midnight(utc + 86400000) };
}
type Context = { kind?: RetroActivity["kind"]; ref?: string; title?: string };
/** Response projections intentionally read explicit fields only. Never spread a provider row. */
export function mapConnectorRows(
  provider: string,
  input: readonly Row[],
  date: string,
  tz: string,
  subject: string,
  context: Context = {},
): RetroActivity[] {
  if (!subject) return [];
  const output: RetroActivity[] = [],
    seen = new Set<string>();
  for (const row of input) {
    if (output.length >= 200) break;
    let kind = context.kind,
      at = "",
      title = "",
      text = "";
    const id = str(row.id);
    const meta: RetroActivity["meta"] = { provider };
    if (provider === "github") {
      if (
        str(record(kind === "github_push" ? row.actor : row.user).id) !==
        subject
      )
        continue;
      if (kind === "github_push" && row.type !== "PushEvent") continue;
      if (kind === "github_review") {
        at = stamp(row.submitted_at);
        title = context.title || "코드 검토";
        text = str(row.state);
      } else if (kind === "github_push") {
        at = stamp(row.created_at);
        title = context.ref || "코드 올리기";
        text = "코드를 올렸습니다.";
      } else {
        kind = "github_pr";
        at = stamp(row.created_at);
        title = str(row.title);
        text = "변경 제안을 만들었습니다.";
      }
      meta.repo = context.ref || "";
    } else if (provider === "figma") {
      if (str(record(row.user).id) !== subject) continue;
      at = stamp(row.created_at);
      if (kind === "figma_comment") {
        title = str(row.message).split("\n")[0] || "남긴 의견";
        text = str(row.message);
        meta.resolved = !!row.resolved_at;
      } else {
        kind = "figma_version";
        title = str(row.label) || "저장한 화면";
        text = str(row.description);
      }
      meta.file = context.ref || "";
    } else if (provider === "google_calendar") {
      if (row.status === "cancelled") continue;
      const attendees = rows(row.attendees);
      const self = attendees.find((a) => a.self === true);
      if (
        record(row.organizer).self !== true &&
        (!self || self.responseStatus === "declined")
      )
        continue;
      kind = "calendar_event";
      const start = record(row.start);
      at = stamp(start.dateTime);
      if (!at && typeof start.date === "string")
        at = dayWindow(start.date, tz).from;
      title = str(row.summary) || "참여 일정";
      // Count the array without accessing attendees' names, email addresses or identifiers.
      meta.attendees = attendees.length;
      meta.online = !!row.hangoutLink || !!row.conferenceData;
    } else if (provider === "notion") {
      if (kind === "notion_comment") {
        if (str(record(row.created_by).id) !== subject) continue;
        at = stamp(row.created_time);
        text = rows(row.rich_text)
          .map((t) => str(t.plain_text) || str(record(t.text).content))
          .join("");
        title = context.title || "문서에 남긴 의견";
      } else {
        if (str(record(row.last_edited_by).id) !== subject) continue;
        kind = "notion_edit";
        at = stamp(row.last_edited_time);
        const property = Object.values(record(row.properties))
          .map(record)
          .find((p) => p.type === "title");
        title =
          rows(property?.title)
            .map((t) => str(t.plain_text) || str(record(t.text).content))
            .join("") || "편집한 문서";
      }
    } else continue;
    if (!kind || !id || !at || localDate(at, tz) !== date || !title.trim())
      continue;
    const ref = (context.ref ? context.ref + ":" : "") + id;
    if (ref.length > 200 || seen.has(kind + ":" + ref)) continue;
    seen.add(kind + ":" + ref);
    output.push(
      normalizeActivity({
        kind,
        ref,
        title: title.slice(0, 200),
        text: text.slice(0, 500),
        at,
        meta,
      }),
    );
  }
  return output;
}
