// Design Ref: desktop-companion §4.1 W01 — 웹과 기기 ASK가 같은 저장·worker 진입점을 쓴다.
import { AskQuestionInput } from "@/lib/contracts";
import type { z } from "zod";
import type { ActorContext, Result } from "@/lib/companion/context";
import { kickWorker } from "@/lib/jobs";
import { mask } from "@/lib/mask";
import { registerAnswerHandler } from "@/lib/pipeline/answer";
import { registerMakeCardHandler } from "@/lib/pipeline/card";
import { registerClassifyHandler } from "@/lib/pipeline/classify";
import { registerEmbedHandler } from "@/lib/pipeline/embed";
import { registerMeetingSummaryHandler } from "@/lib/pipeline/meeting-summary";
import { registerNotionImportHandler } from "@/lib/pipeline/notion-import";
import { registerSendSlackHandler } from "@/lib/pipeline/send-slack";
import { registerSlackBackfillHandler } from "@/lib/pipeline/slack-backfill";

export type AskStartResponse = {
  answer_id: string;
  job_id: string;
  truncated: boolean;
};

const ASK_DAILY_LIMIT_MESSAGE = "오늘 질문 한도(50회)를 모두 사용했습니다. 내일 다시 물어봐 주세요.";

function failure(status: number, code: string, error: string): Result<AskStartResponse> {
  return { ok: false, status, code, error };
}

function registerAskHandlers(): void {
  registerAnswerHandler();
  registerMeetingSummaryHandler();
  registerNotionImportHandler();
  registerClassifyHandler();
  registerEmbedHandler();
  registerMakeCardHandler();
  registerSendSlackHandler();
  registerSlackBackfillHandler();
}

export async function startAsk(
  ctx: ActorContext,
  input: z.infer<typeof AskQuestionInput>,
): Promise<Result<AskStartResponse>> {
  const originalQuestion = input.question.trim();
  const question = mask(originalQuestion).slice(0, 1_000);
  const inserted = await ctx.client.rpc("ask_question", {
    p_dept: ctx.deptId,
    p_question: question,
    p_parent: input.parent_id ?? null,
  });

  if (inserted.error?.code === "P0001" && inserted.error.message === "ask_daily_limit") {
    return failure(429, "ask_daily_limit", ASK_DAILY_LIMIT_MESSAGE);
  }
  if (inserted.error?.code === "42501") {
    return failure(403, "ask_parent_forbidden", "이 질문을 이어갈 수 없습니다. 새 질문으로 시작해주세요.");
  }
  if (inserted.error || !inserted.data) {
    return failure(500, "ask_create_failed", "질문을 저장하지 못했습니다.");
  }

  registerAskHandlers();
  kickWorker();
  const saved = inserted.data as { answer_id: string; job_id: string };
  return {
    ok: true,
    status: 202,
    body: {
      answer_id: saved.answer_id,
      job_id: saved.job_id,
      truncated: originalQuestion.length > 1_000,
    },
  };
}
