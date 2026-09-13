import { enqueue, kickWorker } from "@/lib/jobs";
import { registerAnswerHandler } from "@/lib/pipeline/answer";
import { registerMeetingSummaryHandler } from "@/lib/pipeline/meeting-summary";
import { registerNotionImportHandler } from "@/lib/pipeline/notion-import";
import { registerClassifyHandler } from "@/lib/pipeline/classify";
import { registerEmbedHandler } from "@/lib/pipeline/embed";
import { registerMakeCardHandler } from "@/lib/pipeline/card";
import { registerSendSlackHandler } from "@/lib/pipeline/send-slack";
import { registerSlackBackfillHandler } from "@/lib/pipeline/slack-backfill";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mask } from "@/lib/mask";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);

  let body: { question?: unknown };
  try {
    body = (await request.json()) as { question?: unknown };
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (typeof body.question !== "string" || body.question.trim().length < 5) {
    return Response.json({ error: "질문을 5자 이상 입력해주세요." }, { status: 400 });
  }

  const originalQuestion = body.question.trim();
  const question = mask(originalQuestion).slice(0, 1_000);
  const supabase = await createServerSupabaseClient();
  const insertResult = await supabase
    .from("answers")
    .insert({
      dept_id: membership.deptId,
      asked_by: membership.userId,
      question,
      status: "pending",
      refused: false,
      verified: null,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertResult.error || !insertResult.data) {
    return Response.json({ error: "질문을 저장하지 못했습니다." }, { status: 500 });
  }

  registerAnswerHandler();
  registerMeetingSummaryHandler();
  registerNotionImportHandler();
  registerClassifyHandler();
  registerEmbedHandler();
  registerMakeCardHandler();
  registerSendSlackHandler();
  registerSlackBackfillHandler();
  const jobId = await enqueue("answer", { answerId: insertResult.data.id });
  kickWorker();

  return Response.json(
    {
      ok: true,
      answer_id: insertResult.data.id,
      job_id: jobId,
      truncated: originalQuestion.length > 1_000,
    },
    { status: 202 },
  );
}
