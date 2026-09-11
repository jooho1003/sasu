import { createHash, timingSafeEqual } from "node:crypto";

import { runOnce } from "@/lib/jobs";
import { registerMakeCardHandler } from "@/lib/pipeline/card";
import { registerClassifyHandler } from "@/lib/pipeline/classify";
import { registerEmbedHandler } from "@/lib/pipeline/embed";
import { registerAnswerHandler } from "@/lib/pipeline/answer";
import { registerMeetingSummaryHandler } from "@/lib/pipeline/meeting-summary";
import { registerDocumentSummaryHandler } from "@/lib/pipeline/document-summary";
import { registerNotionImportHandler } from "@/lib/pipeline/notion-import";
import { registerSendSlackHandler } from "@/lib/pipeline/send-slack";
import { registerSlackBackfillHandler } from "@/lib/pipeline/slack-backfill";

export const dynamic = "force-dynamic";

function secretMatches(actual: string | null, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual ?? "").digest();
  const expectedDigest = createHash("sha256").update(expected).digest();

  return timingSafeEqual(actualDigest, expectedDigest);
}

export async function POST(request: Request) {
  const expectedSecret = process.env.JOBS_TRIGGER_SECRET;
  if (!expectedSecret) {
    return Response.json(
      { error: "jobs_trigger_secret_not_configured" },
      { status: 500 },
    );
  }

  if (!secretMatches(request.headers.get("x-jobs-secret"), expectedSecret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    registerClassifyHandler();
    registerEmbedHandler();
  registerAnswerHandler();
    registerMeetingSummaryHandler();
    registerDocumentSummaryHandler();
  registerNotionImportHandler();
    registerMakeCardHandler();
    registerSendSlackHandler();
    registerSlackBackfillHandler();
    return Response.json(await runOnce());
  } catch {
    return Response.json({ error: "worker_failed" }, { status: 500 });
  }
}
