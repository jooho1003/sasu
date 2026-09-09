import { MeetingSummary, type MeetingSummary as MeetingSummaryValue } from "@/lib/contracts";
import { llm } from "@/lib/llm";
import { registerHandler } from "@/lib/jobs";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type MeetingRow = { id: string; dept_id: string; source_id: string; status: string };
type ItemRow = { id: string; content: string };
type SummaryGroup = keyof MeetingSummaryValue;

export function verifyMeetingSummary(
  summary: MeetingSummaryValue,
  items: Map<string, string>,
): { valid: MeetingSummaryValue; dropped: number } {
  let dropped = 0;
  const valid = {} as MeetingSummaryValue;
  for (const group of ["decisions", "deferred", "actions"] as SummaryGroup[]) {
    valid[group] = summary[group].flatMap((entry) => {
      const source = items.get(entry.item_id);
      if (!source || !source.includes(entry.text)) {
        dropped += 1;
        return [];
      }
      return [entry];
    });
  }
  return { valid, dropped };
}

function meetingIdFromPayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) throw new Error("summarize_meeting job payload is invalid");
  const meetingId = Reflect.get(payload, "meetingId");
  if (typeof meetingId !== "string" || !meetingId) throw new Error("summarize_meeting job payload is invalid");
  return meetingId;
}

export async function summarizeMeeting(meetingId: string): Promise<void> {
  const client = createServiceSupabaseClient();
  const meetingResult = await client.from("meetings").select("id, dept_id, source_id, status").eq("id", meetingId).maybeSingle<MeetingRow>();
  if (meetingResult.error) throw new Error("meeting_summary_database_failed");
  const meeting = meetingResult.data;
  if (!meeting || meeting.status !== "transcribed") return;
  const itemsResult = await client.from("items").select("id, content").eq("source_id", meeting.source_id).is("deleted_at", null).order("spoken_at", { ascending: true });
  if (itemsResult.error) throw new Error("meeting_summary_database_failed");
  const items = (itemsResult.data ?? []) as ItemRow[];
  if (items.length === 0) {
    await client.from("meetings").update({ status: "summary_failed", status_reason: "no_transcript_items" }).eq("id", meeting.id);
    return;
  }
  const result = await llm.structured("summarize_meeting", MeetingSummary, {
    system: "회의 기록을 decisions, deferred, actions로 정리하세요. 각 항목의 text는 반드시 제공된 item 원문에 포함된 문자열을 그대로 사용하세요.",
    user: JSON.stringify({ items: items.map((item) => ({ item_id: item.id, content: item.content })) }),
  }, { deptId: meeting.dept_id });
  const verified = verifyMeetingSummary(result.data, new Map(items.map((item) => [item.id, item.content])));
  if (verified.dropped > 0) {
    const error = new Error("meeting_summary_citation_invalid");
    Reflect.set(error, "error_code", "citation_invalid");
    throw error;
  }
  const updateResult = await client.from("meetings").update({ status: "summarized", summary: verified.valid, status_reason: null }).eq("id", meeting.id);
  if (updateResult.error) throw new Error("meeting_summary_database_failed");
}

export function registerMeetingSummaryHandler(): void {
  registerHandler("summarize_meeting", async (payload: unknown) => {
    await summarizeMeeting(meetingIdFromPayload(payload));
  });
}
