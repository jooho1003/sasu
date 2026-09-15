import { runOnce, sweepPendingRows } from "@/lib/jobs";
import { registerMakeCardHandler } from "@/lib/pipeline/card";
import { registerClassifyHandler } from "@/lib/pipeline/classify";
import { registerEmbedHandler } from "@/lib/pipeline/embed";
import { registerAnswerHandler } from "@/lib/pipeline/answer";
import { registerMeetingSummaryHandler } from "@/lib/pipeline/meeting-summary";
import { registerDocumentSummaryHandler } from "@/lib/pipeline/document-summary";
import { registerAgentRoleHandler } from "@/lib/pipeline/agent-role";
import { registerNotionImportHandler } from "@/lib/pipeline/notion-import";
import { registerSendSlackHandler } from "@/lib/pipeline/send-slack";
import { registerSlackBackfillHandler } from "@/lib/pipeline/slack-backfill";
import { registerTrailerGenerateHandler } from "@/lib/pipeline/trailer-generate";
import { registerTrailerGateHandler } from "@/lib/pipeline/trailer-gate";
import { registerTrailerScoreHandler } from "@/lib/pipeline/trailer-score";

// HTTP 정기 호출과 after() 즉시 실행 모두 같은 등록 집합을 사용한다.
export async function runWorkerOnce(limit?: number) {
  registerClassifyHandler();
  registerEmbedHandler();
  registerAnswerHandler();
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
  await sweepPendingRows();
  return runOnce(limit);
}
