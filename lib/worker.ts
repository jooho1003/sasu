import { registerRetroDraftHandler } from "@/lib/pipeline/retro-draft";
import { registerRetroPullHandler, scheduleRetroPulls } from "@/lib/pipeline/retro-pull";
import { runOnce, sweepPendingRows } from "@/lib/jobs";
import { registerReviewHandlers, sweepReviewParts } from "@/lib/pipeline/review-material";
import { registerMakeCardHandler } from "@/lib/pipeline/card";
import { registerClassifyHandler } from "@/lib/pipeline/classify";
import { registerEmbedHandler } from "@/lib/pipeline/embed";
import { registerAnswerHandler } from "@/lib/pipeline/answer";
import { registerSlackAnswerDeliveryHandler } from "@/lib/pipeline/slack-answer-delivery";
import { registerMeetingSummaryHandler } from "@/lib/pipeline/meeting-summary";
import { registerDocumentSummaryHandler } from "@/lib/pipeline/document-summary";
import { registerAgentRoleHandler } from "@/lib/pipeline/agent-role";
import { registerNotionImportHandler, scheduleNotionSync } from "@/lib/pipeline/notion-import";
import { registerNotionDiscoverHandler } from "@/lib/pipeline/notion-discover";
import { registerNotionPollHandler, scheduleNotionPolls } from "@/lib/pipeline/notion-poll";
import { registerSendSlackHandler } from "@/lib/pipeline/send-slack";
import { registerSlackBackfillHandler } from "@/lib/pipeline/slack-backfill";
import { registerTrailerGenerateHandler } from "@/lib/pipeline/trailer-generate";
import { registerTrailerGateHandler } from "@/lib/pipeline/trailer-gate";
import { registerTrailerScoreHandler } from "@/lib/pipeline/trailer-score";
import { registerTrailerPurgeHandler } from "@/lib/pipeline/trailer-purge";
import { registerReminderHandler, scheduleCardReminders } from "@/lib/pipeline/reminder";

function registerWorkerHandlers(): void {
  registerReviewHandlers();
  registerRetroDraftHandler();
  registerRetroPullHandler();
  registerClassifyHandler();
  registerEmbedHandler();
  registerAnswerHandler();
  registerSlackAnswerDeliveryHandler();
  registerMeetingSummaryHandler();
  registerDocumentSummaryHandler();
  registerAgentRoleHandler();
  registerNotionImportHandler();
  registerNotionDiscoverHandler();
  registerNotionPollHandler();
  registerMakeCardHandler();
  registerSendSlackHandler();
  registerSlackBackfillHandler();
  registerTrailerGenerateHandler();
  registerTrailerGateHandler();
  registerTrailerScoreHandler();
  registerTrailerPurgeHandler();
  registerReminderHandler();
}

async function prepareWorker(): Promise<void> {
  registerWorkerHandlers();
  await sweepPendingRows();
  await sweepReviewParts();
  await scheduleNotionSync();
  await scheduleNotionPolls();
  await scheduleCardReminders();
  await scheduleRetroPulls();
}

// HTTP 정기 호출과 after() 즉시 실행 모두 같은 등록 집합을 사용한다.
export async function runWorkerOnce(limit?: number) {
  await prepareWorker();
  return runOnce(limit, "realtime");
}

export async function runWorkerBulk(options: {
  now?: () => number;
  maxRuntimeMs?: number;
  minRemainingMs?: number;
} = {}): Promise<{ claimed: number; done: number; failed: number }> {
  const now = options.now ?? Date.now;
  const maxRuntimeMs = options.maxRuntimeMs ?? 240_000;
  const minRemainingMs = options.minRemainingMs ?? 30_000;
  const startedAt = now();
  const total = { claimed: 0, done: 0, failed: 0 };
  await prepareWorker();
  while (maxRuntimeMs - (now() - startedAt) >= minRemainingMs) {
    const result = await runOnce(25, "bulk");
    total.claimed += result.claimed;
    total.done += result.done;
    total.failed += result.failed;
    if (result.claimed === 0) break;
  }
  return total;
}
