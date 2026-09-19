import type { RetroActivity } from "@/lib/contracts";
import { localDate, normalizeActivity } from "@/lib/retro/bundle";

type ExternalRow = Record<string, unknown>;
const text = (row: ExternalRow, ...keys: string[]) => keys.map(k => row[k]).find((v): v is string => typeof v === "string" && v.trim().length > 0)?.trim() ?? "";
const time = (row: ExternalRow, ...keys: string[]) => { const value = text(row, ...keys); return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null; };
const number = (row: ExternalRow, ...keys: string[]) => keys.map(k => row[k]).find(v => typeof v === "number" && Number.isFinite(v)) as number | undefined;

const definitions: Record<string, { kind: RetroActivity["kind"], title: string[], body?: string[] }> = {
  github: { kind: "github_pr", title: ["title", "name"], body: ["state"] }, figma: { kind: "figma_version", title: ["label", "name", "file_name"], body: ["description"] },
  google_calendar: { kind: "calendar_event", title: ["summary", "title" ] }, calendar: { kind: "calendar_event", title: ["summary", "title" ] },
  hubspot: { kind: "crm_note", title: ["company_name", "company", "subject"], body: ["outcome", "stage"] }, pipedrive: { kind: "crm_deal", title: ["org_name", "title", "subject"], body: ["status", "stage"] },
  channel_talk: { kind: "ticket_handled", title: ["channel", "ticket_id"], body: ["status"] }, intercom: { kind: "ticket_handled", title: ["team", "conversation_id"], body: ["state"] },
  notion: { kind: "notion_edit", title: ["page_title", "title"], body: ["comment"] }, confluence: { kind: "confluence_edit", title: ["title", "page_title"], body: ["message"] }, jira: { kind: "jira_transition", title: ["key", "summary"], body: ["from", "to"] },
  greenhouse: { kind: "ats_stage", title: ["job_name", "job_title"], body: ["stage"] }, lever: { kind: "ats_stage", title: ["job_title", "posting_title"], body: ["stage"] }, workable: { kind: "ats_stage", title: ["job_title"], body: ["stage"] },
  meta: { kind: "social_post", title: ["message", "title"], body: ["status"] }, youtube: { kind: "video_publish", title: ["title"], body: ["status"] }, ga4: { kind: "metric_snapshot", title: ["label", "title"], body: ["summary"] },
};

export function mapConnectorRows(provider: string, rows: readonly ExternalRow[], date: string, tz: string): RetroActivity[] {
  const definition = definitions[provider];
  if (!definition) return [];
  const result: RetroActivity[] = [];
  for (const [index, row] of rows.slice(0, 200).entries()) {
    const at = time(row, "at", "created_at", "updated_at", "timestamp", "start");
    if (!at || localDate(at, tz) !== date) continue;
    const title = text(row, ...definition.title).slice(0, 200) || `${definition.kind} ${index + 1}`;
    const body = text(row, ...(definition.body ?? [])).slice(0, 500);
    const meta: Record<string, string | number | boolean> = { provider };
    if (provider === "google_calendar" || provider === "calendar") {
      const attendees = number(row, "attendees_count", "attendees"); if (attendees !== undefined) meta.attendees = Math.max(0, Math.min(100, Math.floor(attendees)));
      if (typeof row.online === "boolean") meta.online = row.online;
    }
    if (provider === "ga4") meta.metric = "snapshot";
    result.push(normalizeActivity({ kind: definition.kind, ref: text(row, "id", "key", "url") || `${provider}:${index}`, title, text: body, at, meta }));
  }
  return result;
}

export const connectorProviders = Object.keys(definitions);
