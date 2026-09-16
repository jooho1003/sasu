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
import { registerSendSlackHandler } from "@/lib/pipeline/send-slack";
import { registerSlackBackfillHandler } from "@/lib/pipeline/slack-backfill";
import { registerTrailerGenerateHandler } from "@/lib/pipeline/trailer-generate";
import { registerTrailerGateHandler } from "@/lib/pipeline/trailer-gate";
import { registerTrailerScoreHandler } from "@/lib/pipeline/trailer-score";
import { registerReminderHandler, scheduleCardReminders } from "@/lib/pipeline/reminder";

// HTTP 정기 호출과 after() 즉시 실행 모두 같은 등록 집합을 사용한다.
export async function runWorkerOnce(limit?: number) {
  registerReviewHandlers();
  registerClassifyHandler();
  registerEmbedHandler();
  registerAnswerHandler();
  registerSlackAnswerDeliveryHandler();
  registerMeetingSummaryHandler();
  registerDocumentSummaryHandler();
  registerAgentRoleHandler();
  registerNotionImportHandler();
  registerMakeCardHandler();
  registerSendSlackHandler();
  registerSlackBackfillHandler();
  registerTrailerGenerateHandler();
  registerTrailerGateHandler();
  registerTrailerScoreHandler();
  registerReminderHandler();
  await sweepPendingRows();
  await sweepReviewParts();
  await scheduleNotionSync();
  await scheduleCardReminders();
  return runOnce(limit);
}
