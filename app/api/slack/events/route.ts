import { toIngestItem, isCollectible, type SlackMessageEvent } from "@/lib/adapters/slack";
import { kickWorker } from "@/lib/jobs";
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
    const answerResult = await client.rpc("ingest_slack_atomic", {
      p_event_id: envelope.event_id, p_source_id: sourceResult.data.id,
      p_author_ext_id: envelope.event.user, p_kind: "answer", p_content: question,
      p_external_ref: envelope.event.ts ?? null, p_spoken_at: null,
      p_thread_ts: envelope.event.thread_ts ?? envelope.event.ts ?? "",
    });
    if (answerResult.error) return Response.json({ error: "answer_create_failed" }, { status: 500 });
    if (answerResult.data === true) kickWorker();
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

  const itemResult = await client.rpc("ingest_slack_atomic", {
    p_event_id: envelope.event_id, p_source_id: sourceResult.data.id,
    p_author_ext_id: envelope.event.user, p_kind: "item", p_content: item.content,
    p_external_ref: item.external_ref, p_spoken_at: item.spoken_at, p_thread_ts: null,
  });

  if (itemResult.error) {
    return Response.json({ error: "item_upsert_failed" }, { status: 500 });
  }

  if (itemResult.data === true) kickWorker();

  return ok();
}
