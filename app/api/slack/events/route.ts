import { toIngestItem, isCollectible, type SlackMessageEvent } from "@/lib/adapters/slack";
import { after as nextAfter } from "next/server";
import { kickWorker } from "@/lib/jobs";
import { verifySlackSignature } from "@/lib/slack/verify";
import { postMessage, postEphemeral } from "@/lib/slack/post";
import { prepareSlackQuestion, type SlackQuestionDepartment } from "@/lib/slack/question";
import { parseSlackChange } from "@/lib/slack/change";
import { metadataBase } from "@/lib/site";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

import { slackWorkspaceForTeam, withSlackCredentials, currentSlackWorkspace } from "@/lib/slack/workspace";
function after(action: () => Promise<unknown>) {
  const credentials = currentSlackWorkspace() ?? { token: null, teamId: null, orgId: null };
  nextAfter(async () => { await withSlackCredentials(credentials, action); });
}
export const dynamic = "force-dynamic";

type SlackEventEnvelope = {
  team_id?: string;
  type?: string;
  challenge?: string;
  event_id?: string;
  event?: SlackMessageEvent;
};

function ok() {
  return Response.json({ ok: true });
}

const ASK_DAILY_LIMIT_MESSAGE = "오늘 질문 한도(50회)를 모두 사용했습니다. 내일 다시 물어봐 주세요.";

function ingestStatus(data: unknown): string | null {
  if (data === true) return "saved";
  if (data === false) return "duplicate";
  if (typeof data !== "object" || data === null) return null;
  const status = Reflect.get(data, "status");
  return typeof status === "string" ? status : null;
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
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return Response.json({ error: "invalid_event" }, { status: 400 });

  if (envelope.type === "url_verification") {
    return Response.json({ challenge: envelope.challenge ?? "" });
  }

  if (!envelope.event_id || !envelope.event) {
    return Response.json({ error: "invalid_event" }, { status: 400 });
  }

  const adapter = createServiceSupabaseClient();
  const workspace = await slackWorkspaceForTeam(adapter, envelope.team_id);
  if (!workspace) return ok();
  if (envelope.event.type === "app_uninstalled") {
    const revoked = await adapter.rpc("revoke_slack_installation", { p_team: workspace.teamId });
    return revoked.error ? Response.json({ error: "uninstall_failed" }, { status: 500 }) : ok();
  }
  return withSlackCredentials(workspace, () => handleEvent(envelope, request, workspace.teamId!));
}
async function handleEvent(envelope: SlackEventEnvelope & { event?: SlackMessageEvent }, request: Request, teamId: string) {
  if (!envelope.event || !envelope.event_id) return ok();
  if (envelope.event.bot_id) return ok();
  if (["message_changed", "message_deleted"].includes(envelope.event.subtype ?? "")) {
    const change = parseSlackChange(envelope.event);
    if (!change) return ok();
    const adapter = createServiceSupabaseClient();
    const source = await adapter.from("sources").select("id, dept_id").eq("kind", "slack_channel").eq("external_id", change.channel).eq("slack_team_id", teamId).eq("active", true).maybeSingle();
    if (source.error) return Response.json({ error: "source_lookup_failed" }, { status: 500 });
    if (!source.data) return ok();
    if (change.kind === "edit") {
      const member = await adapter.from("members").select("consented_at").eq("dept_id", source.data.dept_id).eq("slack_user_id", change.authorId).maybeSingle();
      if (member.error) return Response.json({ error: "member_lookup_failed" }, { status: 500 });
      if (!member.data?.consented_at) return ok();
    }
    const changed = await adapter.rpc("apply_slack_change", { p_event: `${teamId}:${envelope.event_id}`, p_source: source.data.id, p_ref: change.externalRef, p_changed_at: change.changedAt, p_author: change.authorId, p_content: change.content, p_deleted: change.kind === "delete" });
    if (changed.error) return Response.json({ error: "source_change_failed" }, { status: 500 });
    if (changed.data === true) kickWorker();
    return ok();
  }
  if (envelope.event.subtype && (envelope.event.type === "app_mention" || envelope.event.channel_type === "im")) return ok();
  const client = createServiceSupabaseClient();
  const isDm = envelope.event.type === "message" && envelope.event.channel_type === "im" && /^D[A-Z0-9]+$/.test(envelope.event.channel ?? "");
  if ((envelope.event.type === "app_mention" || isDm) && envelope.event.channel && envelope.event.user && typeof envelope.event.text === "string") {
    const channel = envelope.event.channel;
    const threadTs = envelope.event.thread_ts ?? envelope.event.ts ?? "";
    const user = envelope.event.user;
    const deadline = AbortSignal.timeout(2_500);
    const context = await client.rpc("slack_question_context_for_team", { p_team: teamId, p_author: user, p_channel: channel, p_dm: isDm }).abortSignal(deadline);
    if (context.error) return Response.json({ error: "member_lookup_failed" }, { status: 500 });
    const departments = (context.data ?? []) as SlackQuestionDepartment[];
    const prepared = prepareSlackQuestion(envelope.event.text, departments);
    const notify = (text: string) => after(async () => {
      try {
        if (isDm) await postMessage({ channel, thread_ts: threadTs, text, blocks: [], mrkdwn: false, parse: "none", unfurl_links: false, unfurl_media: false });
        else await postEphemeral({ channel, user, text, thread_ts: threadTs });
      } catch { /* Advisory failure must not cause event redelivery. */ }
    });
    const guidance = (status: string) => {
      if (status === "consent_required") return `질문을 저장하지 않았습니다. 먼저 수집·처리에 동의해 주세요: ${new URL("/consent", metadataBase()).href}`;
      if (status === "choose_department") return `어느 부서에 물어볼까요? "부서 이름: 질문"으로 보내주세요.\n${departments.map(d => `${d.name} (${d.id})`).join("\n")}\n이름이 같으면 부서 ID를 사용할 수 있습니다.`;
      if (status === "too_short") return "질문을 5자 이상 입력해 주세요.";
      if (status === "rate_limited") return ASK_DAILY_LIMIT_MESSAGE;
      return `부서 설정에서 Slack 계정과 채널 연결을 확인해 주세요: ${new URL("/login", metadataBase()).href}`;
    };
    if (prepared.status !== "ready") {
      if (!request.headers.get("x-slack-retry-num")) notify(guidance(prepared.status));
      return ok();
    }
    const answerResult = await client.rpc("ingest_slack_question_for_team", {
      p_team: teamId,
      p_event: envelope.event_id, p_author: user, p_channel: channel, p_thread: threadTs,
      p_dept: prepared.deptId, p_content: prepared.question, p_dm: isDm,
    }).abortSignal(deadline);
    if (answerResult.error) return Response.json({ error: "answer_create_failed" }, { status: 500 });
    const status = ingestStatus(answerResult.data);
    if (status === "saved") {
      if (prepared.truncated) notify("질문이 길어 앞 1,000자까지만 접수했습니다.");
      kickWorker();
    } else if (status && status !== "duplicate") {
      notify(guidance(status));
    }
    return ok();
  }

  if (envelope.event.channel_type === "im" || !isCollectible(envelope.event) || !envelope.event.channel) {
    return ok();
  }

  const sourceResult = await client
    .from("sources")
    .select("id, dept_id")
    .eq("kind", "slack_channel")
    .eq("external_id", envelope.event.channel)
    .eq("slack_team_id", teamId)
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
    p_event_id: `${teamId}:${envelope.event_id}`, p_source_id: sourceResult.data.id,
    p_author_ext_id: envelope.event.user, p_kind: "item", p_content: item.content,
    p_external_ref: item.external_ref, p_spoken_at: item.spoken_at, p_thread_ts: null,
  });

  if (itemResult.error) {
    return Response.json({ error: "item_upsert_failed" }, { status: 500 });
  }

  if (ingestStatus(itemResult.data) === "saved") kickWorker();

  return ok();
}
