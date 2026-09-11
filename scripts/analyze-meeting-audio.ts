import { readFileSync } from "node:fs";

import { loadEnvConfig } from "@next/env";

import { parseTranscript } from "../lib/adapters/transcript";
import { summarizeMeeting } from "../lib/pipeline/meeting-summary";
import { createServiceSupabaseClient } from "../lib/supabase/service";

loadEnvConfig(process.cwd());

const DEPT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SOURCE_ID = "30000000-0000-4000-8000-000000000106";
const MEETING_ID = "30000000-0000-4000-8000-000000000107";
const AUDIO_VTT = "fixtures/mockup/기획팀-9월-런칭-결정회의-30분.vtt";

function itemId(index: number): string {
  return `30000000-0000-4000-8000-${String(200 + index).padStart(12, "0")}`;
}

async function main(): Promise<void> {
  const segments = parseTranscript(AUDIO_VTT, readFileSync(AUDIO_VTT, "utf8"));
  const client = createServiceSupabaseClient();

  await client.from("meetings").delete().eq("id", MEETING_ID);
  await client.from("items").delete().eq("source_id", SOURCE_ID);
  await client.from("sources").delete().eq("id", SOURCE_ID);

  const sourceResult = await client.from("sources").insert({
    id: SOURCE_ID,
    dept_id: DEPT_ID,
    kind: "meeting",
    external_id: "mockup:기획팀-9월-런칭-결정회의-30분",
    title: "기획팀 런칭 결정회의 · 30분 오디오",
    visibility: "dept",
    active: true,
  });
  if (sourceResult.error) throw new Error("audio_mock_source_failed");

  const itemResult = await client.from("items").insert(
    segments.map((segment, index) => ({
      id: itemId(index),
      source_id: SOURCE_ID,
      dept_id: DEPT_ID,
      external_ref: segment.externalRef,
      author_ext_id: `mock-audio-${segment.speaker ?? "unknown"}`,
      author: segment.speaker,
      spoken_at: new Date(Date.UTC(2026, 8, 11, 0, 0, index * 12)).toISOString(),
      content: segment.content,
    })),
  );
  if (itemResult.error) throw new Error("audio_mock_items_failed");

  const meetingResult = await client.from("meetings").insert({
    id: MEETING_ID,
    source_id: SOURCE_ID,
    dept_id: DEPT_ID,
    status: "transcribed",
    status_reason: null,
  });
  if (meetingResult.error) throw new Error("audio_mock_meeting_failed");

  await summarizeMeeting(MEETING_ID);

  const completed = await client
    .from("meetings")
    .select("status, summary, status_reason")
    .eq("id", MEETING_ID)
    .single<{ status: string; summary: { decisions?: unknown[]; deferred?: unknown[]; actions?: unknown[] } | null; status_reason: string | null }>();
  if (completed.error || !completed.data) throw new Error("audio_mock_result_failed");

  console.log(JSON.stringify({
    meetingId: MEETING_ID,
    status: completed.data.status,
    statusReason: completed.data.status_reason,
    segmentCount: segments.length,
    participantCount: new Set(segments.map((segment) => segment.speaker)).size,
    summaryCounts: {
      decisions: completed.data.summary?.decisions?.length ?? 0,
      deferred: completed.data.summary?.deferred?.length ?? 0,
      actions: completed.data.summary?.actions?.length ?? 0,
    },
  }));
}

main().catch((error: unknown) => {
  const errorCode = error instanceof Error && "error_code" in error
    ? Reflect.get(error, "error_code")
    : "unknown";
  console.error("audio analysis failed:", error instanceof Error ? error.message : "unknown", errorCode);
  process.exitCode = 1;
});
