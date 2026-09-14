import { randomUUID } from "node:crypto";

import { parseTranscript, TranscriptParseError } from "@/lib/adapters/transcript";
import { insertUploadedItems } from "@/lib/adapters/upload";
import { enqueue, kickWorker } from "@/lib/jobs";
import { registerClassifyHandler } from "@/lib/pipeline/classify";
import { registerEmbedHandler } from "@/lib/pipeline/embed";
import { registerMeetingSummaryHandler } from "@/lib/pipeline/meeting-summary";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function transcriptParseMessage(error: TranscriptParseError): string {
  switch (error.code) {
    case "invalid_vtt_header":
      return "첫 번째 줄에서 WEBVTT 헤더를 찾지 못했습니다. 파일을 확인한 뒤 다시 올려주세요.";
    case "invalid_timestamp":
      return `${error.line}번째 줄의 시간 형식을 읽을 수 없습니다. 파일을 확인한 뒤 다시 올려주세요.`;
    case "empty_cue":
      return "발언 내용이 비어 있습니다. 파일을 확인한 뒤 다시 올려주세요.";
    case "no_speech":
      return "전사에서 발언을 찾지 못했습니다. 파일을 확인한 뒤 다시 올려주세요.";
    case "unsupported_transcript_format":
      return "VTT 또는 TXT 파일만 업로드할 수 있습니다.";
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") return Response.json({ error: "회의 전사는 팀장만 업로드할 수 있습니다." }, { status: 403 });

  const form = await request.formData();
  const fileValue = form.get("file");
  if (!(fileValue instanceof File)) return Response.json({ error: "전사 파일을 선택해주세요." }, { status: 400 });
  if (fileValue.size === 0 || fileValue.size > MAX_UPLOAD_BYTES) return Response.json({ error: "전사 파일은 10MB 이하이어야 합니다." }, { status: 400 });
  const titleValue = form.get("title");
  const title = typeof titleValue === "string" && titleValue.trim() ? titleValue.trim().slice(0, 120) : fileValue.name;
  const visibility = form.get("visibility") === "leads_only" ? "leads_only" : "dept";
  let segments;
  try {
    segments = parseTranscript(fileValue.name, await fileValue.text());
  } catch (error) {
    if (error instanceof TranscriptParseError) {
      return Response.json({ error: error.code, line: error.line, message: transcriptParseMessage(error) }, { status: 422 });
    }
    return Response.json({ error: "전사 파일을 읽지 못했습니다." }, { status: 400 });
  }
  if (segments.length === 0) return Response.json({ error: "전사에서 발언을 찾지 못했습니다." }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const demoResult = await supabase.rpc("is_demo_department", { p_dept: membership.deptId });
  if (demoResult.error || typeof demoResult.data !== "boolean") {
    return Response.json({ error: "부서 상태를 확인하지 못했습니다." }, { status: 500 });
  }
  if (demoResult.data) return Response.json({ error: "데모에서는 전사를 업로드할 수 없습니다." }, { status: 403 });
  const membersResult = await supabase.from("members").select("user_id, display_name, slack_user_id, consented_at").eq("dept_id", membership.deptId);
  if (membersResult.error) return Response.json({ error: "부서 멤버를 확인하지 못했습니다." }, { status: 500 });
  const membersByName = new Map((membersResult.data ?? []).map((member) => [member.display_name.trim(), member]));
  const accepted = segments.flatMap((segment) => {
    if (!segment.speaker) return [];
    const member = membersByName.get(segment.speaker.trim());
    if (!member?.consented_at) return [];
    return [{ segment, member }];
  });
  if (accepted.length === 0) return Response.json({ error: "동의한 멤버로 확인되는 발언이 없습니다." }, { status: 409 });

  const sourceId = randomUUID();
  const sourceResult = await supabase.from("sources").insert({ id: sourceId, dept_id: membership.deptId, kind: "meeting", external_id: `upload:${sourceId}`, title, visibility, active: true }).select("id").single<{ id: string }>();
  if (sourceResult.error || !sourceResult.data) return Response.json({ error: "회의 소스를 저장하지 못했습니다." }, { status: 500 });
  const meetingId = randomUUID();

  // ADR-042: 동의한 멤버의 발언을 마스킹한 뒤에만 수집 어댑터 INSERT.
  // 조회·소스·회의 메타데이터는 계속 세션 클라이언트와 RLS를 사용한다.
  const itemResult = await insertUploadedItems(accepted.map(({ segment, member }) => ({
    source_id: sourceId,
    dept_id: membership.deptId,
    external_ref: segment.externalRef,
    author_ext_id: member.slack_user_id ?? member.user_id,
    author: member.display_name,
    spoken_at: null,
    content: segment.content,
  })));
  if (itemResult.error) return Response.json({ error: "전사 발언을 저장하지 못했습니다." }, { status: 500 });
  const meetingResult = await supabase.from("meetings").insert({ id: meetingId, source_id: sourceId, dept_id: membership.deptId, status: "transcribed", status_reason: null }).select("id").single<{ id: string }>();
  if (meetingResult.error || !meetingResult.data) return Response.json({ error: "회의를 저장하지 못했습니다." }, { status: 500 });

  registerClassifyHandler();
  registerEmbedHandler();
  registerMeetingSummaryHandler();
  for (const item of itemResult.data ?? []) await enqueue("classify", { itemId: item.id }, { dedupeKey: item.id });
  const summaryJobId = await enqueue("summarize_meeting", { meetingId }, { dedupeKey: meetingId });
  kickWorker();
  return Response.json({ ok: true, meeting_id: meetingId, summary_job_id: summaryJobId, accepted: accepted.length, skipped: segments.length - accepted.length }, { status: 202 });
}
