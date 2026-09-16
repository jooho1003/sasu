import { kickWorker } from "@/lib/jobs";
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
import { AskQuestionInput } from "@/lib/contracts";

const ASK_DAILY_LIMIT_MESSAGE = "오늘 질문 한도(50회)를 모두 사용했습니다. 내일 다시 물어봐 주세요.";

function isAskDailyLimit(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "P0001" && error.message === "ask_daily_limit";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const parsed = AskQuestionInput.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "질문을 5자 이상 입력해주세요." }, { status: 400 });
  }

  const body = parsed.data;
  const originalQuestion = body.question.trim();
  const question = mask(originalQuestion).slice(0, 1_000);
  const supabase = await createServerSupabaseClient();
  const insertResult = await supabase.rpc("ask_question", {
    p_dept: membership.deptId, p_question: question, p_parent: body.parent_id ?? null,
  });

  if (isAskDailyLimit(insertResult.error)) {
    return Response.json(
      { error: "ask_daily_limit", message: ASK_DAILY_LIMIT_MESSAGE },
      { status: 429 },
    );
  }

  if (insertResult.error?.code === "42501") return Response.json({ error: "이 질문을 이어갈 수 없습니다. 새 질문으로 시작해주세요." }, { status: 403 });
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
  const saved = insertResult.data as { answer_id: string; job_id: string };
  kickWorker();

  return Response.json(
    {
      ok: true,
      answer_id: saved.answer_id,
      job_id: saved.job_id,
      truncated: originalQuestion.length > 1_000,
    },
    { status: 202 },
  );
}
