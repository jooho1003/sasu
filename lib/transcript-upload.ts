// Design Ref: desktop-companion §4.1 W05 — 전사 업로드의 동의·마스킹·job 순서를 웹과 기기가 공유한다.
import { randomUUID } from "node:crypto";

import { parseTranscript, TranscriptParseError } from "@/lib/adapters/transcript";
import { insertUploadedItems } from "@/lib/adapters/upload";
import type { ActorContext, Result } from "@/lib/companion/context";
import { enqueue, kickWorker } from "@/lib/jobs";
import { registerClassifyHandler } from "@/lib/pipeline/classify";
import { registerEmbedHandler } from "@/lib/pipeline/embed";
import { registerMeetingSummaryHandler } from "@/lib/pipeline/meeting-summary";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export type TranscriptMeta = { title: string; visibility: "dept" | "leads_only" };
export type TranscriptIngestResponse = { job_ids: string[]; meeting_id: string; summary_job_id: string; accepted: number; skipped: number };
type TranscriptIngestResult = Result<TranscriptIngestResponse> & { line?: number };

function failure(status: number, code: string, error: string, line?: number): TranscriptIngestResult {
  return { ok: false, status, code, error, ...(line === undefined ? {} : { line }) };
}
function transcriptParseMessage(error: TranscriptParseError): string {
  switch (error.code) {
    case "invalid_vtt_header": return "자막 파일의 첫 줄 형식을 확인하지 못했습니다. 파일을 확인한 뒤 다시 올려주세요.";
    case "invalid_timestamp": return `${error.line}번째 줄의 시간 형식을 읽을 수 없습니다. 파일을 확인한 뒤 다시 올려주세요.`;
    case "empty_cue": return "발언 내용이 비어 있습니다. 파일을 확인한 뒤 다시 올려주세요.";
    case "no_speech": return "받아쓴 글에서 발언을 찾지 못했습니다. 파일을 확인한 뒤 다시 올려주세요.";
    case "unsupported_transcript_format": return ".vtt 파일 또는 .txt 파일만 업로드할 수 있습니다.";
  }
}

export async function ingestTranscript(ctx: ActorContext, file: File, meta: TranscriptMeta): Promise<TranscriptIngestResult> {
  if (ctx.role !== "lead") return failure(403, "lead_only", "회의 받아쓴 글은 팀장만 업로드할 수 있습니다.");
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) return failure(400, "invalid_file_size", "받아쓴 글 파일은 10메가바이트 이하이어야 합니다.");
  let segments;
  try { segments = parseTranscript(file.name, await file.text()); }
  catch (error) {
    if (error instanceof TranscriptParseError) return failure(422, error.code, transcriptParseMessage(error), error.line ?? undefined);
    return failure(400, "transcript_read_failed", "받아쓴 글 파일을 읽지 못했습니다.");
  }
  if (!segments.length) return failure(400, "no_speech", "받아쓴 글에서 발언을 찾지 못했습니다.");
  const demoResult = await ctx.client.rpc("is_demo_department", { p_dept: ctx.deptId });
  if (demoResult.error || typeof demoResult.data !== "boolean") return failure(500, "demo_check_failed", "부서 상태를 확인하지 못했습니다.");
  if (demoResult.data) return failure(403, "demo", "데모에서는 받아쓴 글을 업로드할 수 없습니다.");
  const membersResult = await ctx.client.from("members").select("user_id, display_name, slack_user_id, consented_at").eq("dept_id", ctx.deptId);
  if (membersResult.error) return failure(500, "members_read_failed", "부서 멤버를 확인하지 못했습니다.");
  const membersByName = new Map((membersResult.data ?? []).map((member) => [member.display_name.trim(), member]));
  const accepted = segments.flatMap((segment) => {
    if (!segment.speaker) return [];
    const member = membersByName.get(segment.speaker.trim());
    return member?.consented_at ? [{ segment, member }] : [];
  });
  if (!accepted.length) return failure(409, "no_consented_speaker", "동의한 멤버로 확인되는 발언이 없습니다.");
  const sourceId = randomUUID();
  const sourceResult = await ctx.client.from("sources").insert({ id: sourceId, dept_id: ctx.deptId, kind: "meeting", external_id: `upload:${sourceId}`, title: meta.title, visibility: meta.visibility, active: true }).select("id").single<{ id: string }>();
  if (sourceResult.error || !sourceResult.data) return failure(500, "source_create_failed", "회의 소스를 저장하지 못했습니다.");
  const meetingId = randomUUID();
  // ADR-042: 마스킹된 동의 화자 발언만 수집 어댑터가 privileged INSERT 한다.
  const itemResult = await insertUploadedItems(accepted.map(({ segment, member }) => ({ source_id: sourceId, dept_id: ctx.deptId, external_ref: segment.externalRef, author_ext_id: member.slack_user_id ?? member.user_id, author: member.display_name, spoken_at: null, content: segment.content })));
  if (itemResult.error) return failure(500, "item_create_failed", "받아쓴 글 발언을 저장하지 못했습니다.");
  const meetingResult = await ctx.client.from("meetings").insert({ id: meetingId, source_id: sourceId, dept_id: ctx.deptId, status: "transcribed", status_reason: null }).select("id").single<{ id: string }>();
  if (meetingResult.error || !meetingResult.data) return failure(500, "meeting_create_failed", "회의를 저장하지 못했습니다.");
  registerClassifyHandler(); registerEmbedHandler(); registerMeetingSummaryHandler();
  const jobIds: string[] = [];
  for (const item of itemResult.data ?? []) jobIds.push(await enqueue("classify", { itemId: item.id }, { dedupeKey: item.id }));
  const summaryJobId = await enqueue("summarize_meeting", { meetingId }, { dedupeKey: meetingId });
  jobIds.push(summaryJobId); kickWorker();
  return { ok: true, status: 202, body: { job_ids: jobIds, meeting_id: meetingId, summary_job_id: summaryJobId, accepted: accepted.length, skipped: segments.length - accepted.length } };
}
