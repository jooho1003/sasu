import { toIngestItem, isCollectible, type SlackMessageEvent } from "@/lib/adapters/slack";
import { enqueue, kickWorker } from "@/lib/jobs";
import { registerMakeCardHandler } from "@/lib/pipeline/card";
import { registerClassifyHandler } from "@/lib/pipeline/classify";
import { registerEmbedHandler } from "@/lib/pipeline/embed";
import { registerAnswerHandler } from "@/lib/pipeline/answer";
import { registerSendSlackHandler } from "@/lib/pipeline/send-slack";
import { registerSlackBackfillHandler } from "@/lib/pipeline/slack-backfill";
import { registerMeetingSummaryHandler } from "@/lib/pipeline/meeting-summary";
import { registerNotionImportHandler } from "@/lib/pipeline/notion-import";
import { verifySlackSignature } from "@/lib/slack/verify";
import { mask } from "@/lib/mask";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

type SlackEventEnvelope = {
  type?: string;
  challenge?: string;
  event_id?: string;
  event?: SlackMessageEvent;
};

function ok() {
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (!signingSecret) {
    return Response.json(
      { error: "slack_signing_secret_not_configured" },
      { status: 500 },
    );
  }

  const signatureIsValid = verifySlackSignature({
    rawBody,
    timestamp: request.headers.get("x-slack-request-timestamp") ?? "",
    signature: request.headers.get("x-slack-signature") ?? "",
    signingSecret,
  });
  if (!signatureIsValid) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let envelope: SlackEventEnvelope;
  try {
    envelope = JSON.parse(rawBody) as SlackEventEnvelope;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (envelope.type === "url_verification") {
    return Response.json({ challenge: envelope.challenge ?? "" });
  }

  if (!envelope.event_id || !envelope.event) {
    return Response.json({ error: "invalid_event" }, { status: 400 });
  }

  const client = createServiceSupabaseClient();
  const ingestResult = await client
    .from("ingest_events")
    .insert({ event_id: envelope.event_id });

  if (ingestResult.error?.code === "23505") {
    return ok();
  }
  if (ingestResult.error) {
    return Response.json({ error: "ingest_event_failed" }, { status: 500 });
  }

  if (envelope.event.type === "app_mention" && envelope.event.channel && envelope.event.user && envelope.event.text) {
    const sourceResult = await client
      .from("sources")
      .select("id, dept_id")
      .eq("kind", "slack_channel")
      .eq("external_id", envelope.event.channel)
      .eq("active", true)
      .maybeSingle();
    if (sourceResult.error) return Response.json({ error: "source_lookup_failed" }, { status: 500 });
    if (!sourceResult.data) return ok();
    const memberResult = await client
      .from("members")
      .select("user_id, consented_at")
      .eq("dept_id", sourceResult.data.dept_id)
      .eq("slack_user_id", envelope.event.user)
      .maybeSingle();
    if (memberResult.error) return Response.json({ error: "member_lookup_failed" }, { status: 500 });
    if (!memberResult.data?.consented_at) return ok();
    const question = mask(envelope.event.text.replace(/<@[^>]+>/gu, " ").replace(/\s+/gu, " ").trim()).slice(0, 1_000);
    if (question.length < 5) return ok();
    const answerResult = await client
      .from("answers")
      .insert({ dept_id: sourceResult.data.dept_id, asked_by: memberResult.data.user_id, question, status: "pending" })
      .select("id")
      .single<{ id: string }>();
    if (answerResult.error || !answerResult.data) return Response.json({ error: "answer_create_failed" }, { status: 500 });
    registerAnswerHandler();
    await enqueue("answer", {
      answerId: answerResult.data.id,
      slackReply: { channel: envelope.event.channel, threadTs: envelope.event.thread_ts ?? envelope.event.ts ?? "" },
    });
    kickWorker();
    return ok();
  }

  if (!isCollectible(envelope.event) || !envelope.event.channel) {
    return ok();
  }

  const sourceResult = await client
    .from("sources")
    .select("id, dept_id")
    .eq("kind", "slack_channel")
    .eq("external_id", envelope.event.channel)
    .eq("active", true)
    .maybeSingle();

  if (sourceResult.error) {
    return Response.json({ error: "source_lookup_failed" }, { status: 500 });
  }
  if (!sourceResult.data) {
    return ok();
  }

  const memberResult = await client
    .from("members")
    .select("display_name, consented_at")
    .eq("dept_id", sourceResult.data.dept_id)
    .eq("slack_user_id", envelope.event.user as string)
    .maybeSingle();

  if (memberResult.error) {
    return Response.json({ error: "member_lookup_failed" }, { status: 500 });
  }
  if (!memberResult.data?.consented_at) {
    return ok();
  }

  const item = toIngestItem(envelope.event, {
    sourceId: sourceResult.data.id,
    deptId: sourceResult.data.dept_id,
    author: memberResult.data.display_name,
  });
  if (!item) {
    return ok();
  }

  const itemResult = await client
    .from("items")
    .upsert(
      { ...item, dept_id: sourceResult.data.dept_id },
      { onConflict: "source_id,external_ref" },
    )
    .select("id")
    .single();

  if (itemResult.error || !itemResult.data?.id) {
    return Response.json({ error: "item_upsert_failed" }, { status: 500 });
  }

  registerClassifyHandler();
  registerEmbedHandler();
  registerAnswerHandler();
  registerMakeCardHandler();
  registerSendSlackHandler();
  registerSlackBackfillHandler();
  registerMeetingSummaryHandler();
  registerNotionImportHandler();
  await enqueue("classify", { itemId: itemResult.data.id });
  kickWorker();

  return ok();
}
