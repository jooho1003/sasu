import { actorFromMembership } from "@/lib/companion/context";
import { ingestTranscript } from "@/lib/transcript-upload";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") {
    return Response.json({ error: "회의 받아쓴 글은 팀장만 업로드할 수 있습니다." }, { status: 403 });
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "받아쓴 글 파일을 선택해주세요." }, { status: 400 });
  const titleValue = form.get("title");
  const title = typeof titleValue === "string" && titleValue.trim() ? titleValue.trim().slice(0, 120) : file.name;
  const visibility = form.get("visibility") === "leads_only" ? "leads_only" : "dept";
  const client = await createServerSupabaseClient();
  const result = await ingestTranscript(actorFromMembership(client, membership), file, { title, visibility });
  if (!result.ok) {
    const body = ["invalid_vtt_header", "invalid_timestamp", "empty_cue", "no_speech", "unsupported_transcript_format"].includes(result.code)
      ? { error: result.code, message: result.error, ...(result.line === undefined ? {} : { line: result.line }) }
      : { error: result.error };
    return Response.json(body, { status: result.status });
  }
  return Response.json({ ok: true, meeting_id: result.body.meeting_id, summary_job_id: result.body.summary_job_id, accepted: result.body.accepted, skipped: result.body.skipped }, { status: 202 });
}
