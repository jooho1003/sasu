import { MeetingSummary, type MeetingSummary as MeetingSummaryValue } from "@/lib/contracts";
import { llm } from "@/lib/llm";
import { registerHandler } from "@/lib/jobs";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type MeetingRow = { id: string; dept_id: string; source_id: string; status: string };
type ItemRow = { id: string; content: string };
type SummaryGroup = keyof MeetingSummaryValue;
export const MEETING_SUMMARY_CHUNK_SIZE = 12;

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

export function chunkMeetingItems(items: ItemRow[], size = MEETING_SUMMARY_CHUNK_SIZE): ItemRow[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error("meeting_summary_chunk_size_invalid");
  }

  const chunks: ItemRow[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function mergeMeetingSummaries(summaries: MeetingSummaryValue[]): MeetingSummaryValue {
  const merged: MeetingSummaryValue = {
    decisions: [],
    deferred: [],
    actions: [],
  };
  const seen = new Set<string>();

  for (const summary of summaries) {
    for (const group of ["decisions", "deferred", "actions"] as SummaryGroup[]) {
      for (const entry of summary[group]) {
        const key = `${group}:${entry.item_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged[group].push(entry);
      }
    }
  }

  return merged;
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
  const summaries: MeetingSummaryValue[] = [];
  for (const [chunkIndex, chunk] of chunkMeetingItems(items).entries()) {
    try {
      const result = await llm.structured("summarize_meeting", MeetingSummary, {
        system: "회의 기록을 decisions, deferred, actions로 정리하세요. 긴 회의는 일부 발언만 주어질 수 있습니다. 각 항목의 text는 반드시 제공된 item 원문에 포함된 문자열을 그대로 사용하세요.",
        user: JSON.stringify({ items: chunk.map((item) => ({ item_id: item.id, content: item.content })) }),
      }, { deptId: meeting.dept_id });
      summaries.push(result.data);
    } catch (error) {
      const wrapped = new Error(`meeting_summary_chunk_failed:${chunkIndex}`, { cause: error });
      Reflect.set(wrapped, "error_code", error instanceof Error && "error_code" in error ? Reflect.get(error, "error_code") : "unknown");
      throw wrapped;
    }
  }
  const summary = mergeMeetingSummaries(summaries);
  const verified = verifyMeetingSummary(summary, new Map(items.map((item) => [item.id, item.content])));
  const validCount = Object.values(verified.valid).reduce((count, group) => count + group.length, 0);
  if (validCount === 0) {
    const updateResult = await client
      .from("meetings")
      .update({ status: "summary_failed", summary: verified.valid, status_reason: "citation_invalid" })
      .eq("id", meeting.id);
    if (updateResult.error) throw new Error("meeting_summary_database_failed");
    return;
  }

  const updateResult = await client
    .from("meetings")
    .update({
      status: "summarized",
      summary: verified.valid,
      status_reason: verified.dropped > 0 ? "citation_invalid_dropped" : null,
    })
    .eq("id", meeting.id);
  if (updateResult.error) throw new Error("meeting_summary_database_failed");
}

export function registerMeetingSummaryHandler(): void {
  registerHandler("summarize_meeting", async (payload: unknown) => {
    await summarizeMeeting(meetingIdFromPayload(payload));
  });
}
