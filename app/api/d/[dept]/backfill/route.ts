import { enqueue, kickWorker } from "@/lib/jobs";
import { registerMakeCardHandler } from "@/lib/pipeline/card";
import { registerClassifyHandler } from "@/lib/pipeline/classify";
import { registerEmbedHandler } from "@/lib/pipeline/embed";
import { registerAnswerHandler } from "@/lib/pipeline/answer";
import { registerSendSlackHandler } from "@/lib/pipeline/send-slack";
import { registerSlackBackfillHandler } from "@/lib/pipeline/slack-backfill";
import { registerMeetingSummaryHandler } from "@/lib/pipeline/meeting-summary";
import { registerNotionImportHandler } from "@/lib/pipeline/notion-import";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") {
    return Response.json({ error: "채널 백필은 팀장만 시작할 수 있습니다." }, { status: 403 });
  }

  let body: { source_id?: unknown };
  try {
    body = (await request.json()) as { source_id?: unknown };
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (typeof body.source_id !== "string" || body.source_id.length === 0) {
    return Response.json({ error: "백필할 Slack 채널을 선택해주세요." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const sourceResult = await supabase
    .from("sources")
    .select("id")
    .eq("id", body.source_id)
    .eq("dept_id", membership.deptId)
    .eq("kind", "slack_channel")
    .eq("active", true)
    .maybeSingle<{ id: string }>();

  if (sourceResult.error) {
    return Response.json({ error: "Slack 채널을 확인하지 못했습니다." }, { status: 500 });
  }
  if (!sourceResult.data) {
    return Response.json({ error: "연결된 Slack 채널을 찾을 수 없습니다." }, { status: 404 });
  }

  registerSlackBackfillHandler();
  registerClassifyHandler();
  registerEmbedHandler();
  registerAnswerHandler();
  registerMakeCardHandler();
  registerSendSlackHandler();
  registerMeetingSummaryHandler();
  registerNotionImportHandler();
  const dateKey = new Date().toISOString().slice(0, 10);
  const jobId = await enqueue(
    "slack_backfill",
    { sourceId: sourceResult.data.id },
    { dedupeKey: `${sourceResult.data.id}:${dateKey}` },
  );
  kickWorker();

  return Response.json({ ok: true, job_id: jobId }, { status: 202 });
}
