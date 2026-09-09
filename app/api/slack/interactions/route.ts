import { after } from "next/server";

import { verifySlackSignature } from "@/lib/slack/verify";
import { buildDecisionModal } from "@/lib/slack/blocks";
import { openModal, updateMessage } from "@/lib/slack/post";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

type InteractionPayload = {
  type?: string;
  trigger_id?: string;
  user?: { id?: string };
  actions?: Array<{ action_id?: string; value?: string }>;
  container?: { channel_id?: string; message_ts?: string };
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: {
      values?: Record<string, Record<string, { value?: string }>>;
    };
  };
};

type CardRow = {
  id: string;
  dept_id: string;
  title: string;
  recommendation: string | null;
  assignee_id: string | null;
  status: "open" | "decided" | "deferred" | "rejected" | "needs_review";
  opened_at: string | null;
};

type MemberRow = {
  user_id: string;
  display_name: string;
  role: "lead" | "member";
  consented_at: string | null;
};

type DecisionRow = {
  id: string;
  decided_by_name: string;
  decided_at: string | null;
};

type DecisionStatus = "decided" | "deferred" | "rejected";

class SlackInteractionError extends Error {
  readonly blockId: string;

  constructor(message: string, blockId = "sasu_rationale") {
    super(message);
    this.name = "SlackInteractionError";
    this.blockId = blockId;
  }
}

function responseOk(): Response {
  return new Response(null, { status: 200 });
}

function responseError(message: string, blockId = "sasu_rationale"): Response {
  return Response.json({
    response_action: "errors",
    errors: { [blockId]: message },
  });
}

function firstInputValue(
  values: Record<string, Record<string, { value?: string }>> | undefined,
  blockId: string,
): string {
  const block = values?.[blockId];
  if (!block) {
    return "";
  }
  const input = Object.values(block)[0];
  return typeof input?.value === "string" ? input.value.trim() : "";
}

function isDecisionStatus(value: unknown): value is DecisionStatus {
  return value === "decided" || value === "deferred" || value === "rejected";
}

async function authorizedCard(
  client: ReturnType<typeof createServiceSupabaseClient>,
  requestId: string,
  slackUserId: string,
): Promise<{ card: CardRow; member: MemberRow }> {
  const cardResult = await client
    .from("decision_requests")
    .select("id, dept_id, title, recommendation, assignee_id, status, opened_at")
    .eq("id", requestId)
    .maybeSingle<CardRow>();
  if (cardResult.error || !cardResult.data) {
    throw new SlackInteractionError("결정 카드를 찾을 수 없습니다.");
  }

  const memberResult = await client
    .from("members")
    .select("user_id, display_name, role, consented_at")
    .eq("dept_id", cardResult.data.dept_id)
    .eq("slack_user_id", slackUserId)
    .maybeSingle<MemberRow>();
  if (memberResult.error || !memberResult.data) {
    throw new SlackInteractionError("Slack 계정이 이 부서에 연결되어 있지 않습니다.");
  }

  const member = memberResult.data;
  if (
    member.consented_at === null ||
    (member.role !== "lead" && member.user_id !== cardResult.data.assignee_id)
  ) {
    throw new SlackInteractionError("이 카드를 처리할 권한이 없습니다.");
  }

  return { card: cardResult.data, member };
}

async function existingDecision(
  client: ReturnType<typeof createServiceSupabaseClient>,
  requestId: string,
): Promise<DecisionRow | null> {
  const result = await client
    .from("decisions")
    .select("id, decided_by_name, decided_at")
    .eq("request_id", requestId)
    .maybeSingle<DecisionRow>();
  if (result.error) {
    throw new SlackInteractionError("기존 원장 기록을 확인하지 못했습니다.");
  }
  return result.data;
}

async function recordDecision(args: {
  requestId: string;
  slackUserId: string;
  status: DecisionStatus;
  outcome: string;
  rationale: string;
}): Promise<{ decisionId: string | null; message: string }> {
  const client = createServiceSupabaseClient();
  const { card, member } = await authorizedCard(
    client,
    args.requestId,
    args.slackUserId,
  );
  const existing = await existingDecision(client, card.id);
  if (existing) {
    return {
      decisionId: existing.id,
      message: `이미 ${existing.decided_by_name}이(가) 결정한 카드입니다.`,
    };
  }

  if (card.status !== "open") {
    throw new SlackInteractionError("현재 처리할 수 없는 카드 상태입니다.");
  }

  const outcome = args.outcome.trim();
  const rationale = args.rationale.trim();
  if (args.status === "decided" && !outcome) {
    throw new SlackInteractionError("결정 결과를 입력해주세요.", "sasu_outcome");
  }
  if (args.status === "decided" && !rationale) {
    throw new SlackInteractionError("결정 사유를 입력해주세요.");
  }
  if (outcome.length > 1_000 || rationale.length > 1_000) {
    throw new SlackInteractionError("입력은 1,000자 이내로 작성해주세요.");
  }

  const now = new Date();
  if (args.status !== "decided") {
    const updateResult = await client
      .from("decision_requests")
      .update({
        status: args.status,
        closed_at: args.status === "rejected" ? now.toISOString() : null,
      })
      .eq("id", card.id)
      .eq("status", "open")
      .select("id")
      .maybeSingle<{ id: string }>();
    if (updateResult.error || !updateResult.data) {
      throw new SlackInteractionError("카드 상태가 이미 바뀌었습니다.");
    }
    return {
      decisionId: null,
      message: args.status === "deferred" ? "카드를 보류했습니다." : "카드를 반려했습니다.",
    };
  }

  const openedAt = card.opened_at ? new Date(card.opened_at).getTime() : now.getTime();
  const leadTimeMin = Math.max(0, Math.floor((now.getTime() - openedAt) / 60_000));
  const insertResult = await client
    .from("decisions")
    .insert({
      dept_id: card.dept_id,
      request_id: card.id,
      decided_by: member.user_id,
      decided_by_name: member.display_name,
      decided_at: now.toISOString(),
      outcome,
      rationale,
      supersedes_id: null,
      lead_time_min: leadTimeMin,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertResult.error) {
    if (insertResult.error.code === "23505") {
      const duplicate = await existingDecision(client, card.id);
      if (duplicate) {
        return {
          decisionId: duplicate.id,
          message: `이미 ${duplicate.decided_by_name}이(가) 결정한 카드입니다.`,
        };
      }
    }
    throw new SlackInteractionError("결정을 원장에 기록하지 못했습니다.");
  }

  const closeResult = await client
    .from("decision_requests")
    .update({ status: "decided", closed_at: now.toISOString() })
    .eq("id", card.id)
    .eq("status", "open");
  if (closeResult.error) {
    throw new SlackInteractionError("결정은 기록됐지만 카드 상태를 닫지 못했습니다.");
  }

  return {
    decisionId: insertResult.data.id,
    message: "결정을 원장에 기록했습니다.",
  };
}

async function handleBlockAction(payload: InteractionPayload): Promise<Response> {
  const action = payload.actions?.[0];
  const slackUserId = payload.user?.id;
  const requestId = action?.value;
  if (!action?.action_id || !slackUserId || !requestId || !payload.trigger_id) {
    return responseOk();
  }

  const statusByAction: Record<string, DecisionStatus> = {
    sasu_decide_card: "decided",
    sasu_defer_card: "deferred",
    sasu_reject_card: "rejected",
  };
  const status = statusByAction[action.action_id];
  if (!status) {
    return responseOk();
  }

  const client = createServiceSupabaseClient();
  const { card } = await authorizedCard(client, requestId, slackUserId);
  await openModal({
    triggerId: payload.trigger_id,
    view: buildDecisionModal({
      requestId: card.id,
      status,
      outcome: card.recommendation ?? card.title,
      deptId: card.dept_id,
      channelId: payload.container?.channel_id,
      messageTs: payload.container?.message_ts,
    }),
  });
  return responseOk();
}

async function handleViewSubmission(payload: InteractionPayload): Promise<Response> {
  const slackUserId = payload.user?.id;
  const view = payload.view;
  if (!slackUserId || view?.callback_id !== "sasu_decision_modal") {
    return responseOk();
  }

  let metadata: {
    requestId?: unknown;
    status?: unknown;
    deptId?: unknown;
    channelId?: unknown;
    messageTs?: unknown;
  };
  try {
    metadata = JSON.parse(view.private_metadata ?? "") as typeof metadata;
  } catch {
    return responseError("모달 정보를 확인하지 못했습니다.");
  }
  if (
    typeof metadata.requestId !== "string" ||
    !isDecisionStatus(metadata.status)
  ) {
    return responseError("모달 정보가 올바르지 않습니다.");
  }

  try {
    const result = await recordDecision({
      requestId: metadata.requestId,
      slackUserId,
      status: metadata.status,
      outcome: firstInputValue(view.state?.values, "sasu_outcome"),
      rationale: firstInputValue(view.state?.values, "sasu_rationale"),
    });

    if (typeof metadata.channelId === "string" && typeof metadata.messageTs === "string") {
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/u, "");
      const deptPath = typeof metadata.deptId === "string" ? `/d/${metadata.deptId}` : "";
      const ledgerHref = `${baseUrl}${deptPath}/ledger#decision-${result.decisionId ?? metadata.requestId}`;
      after(() =>
        updateMessage({
          channel: metadata.channelId as string,
          ts: metadata.messageTs as string,
          text: result.message,
          blocks: [
            {
              type: "section",
              text: { type: "mrkdwn", text: `✅ ${result.message}\n<${ledgerHref}|원장에서 보기>` },
            },
          ],
        }).catch(() => undefined),
      );
    }
    return Response.json({ response_action: "clear" });
  } catch (error) {
    if (error instanceof SlackInteractionError) {
      return responseError(error.message, error.blockId);
    }
    return responseError("카드를 처리하지 못했습니다. 웹 카드에서 다시 시도해주세요.");
  }
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return Response.json({ error: "slack_signing_secret_not_configured" }, { status: 500 });
  }

  if (!verifySlackSignature({
    rawBody,
    timestamp: request.headers.get("x-slack-request-timestamp") ?? "",
    signature: request.headers.get("x-slack-signature") ?? "",
    signingSecret,
  })) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const encoded = new URLSearchParams(rawBody).get("payload");
  if (!encoded) {
    return Response.json({ error: "invalid_payload" }, { status: 400 });
  }

  let payload: InteractionPayload;
  try {
    payload = JSON.parse(encoded) as InteractionPayload;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    if (payload.type === "block_actions") {
      return await handleBlockAction(payload);
    }
    if (payload.type === "view_submission") {
      return await handleViewSubmission(payload);
    }
    return responseOk();
  } catch (error) {
    if (error instanceof SlackInteractionError) {
      return responseError(error.message, error.blockId);
    }
    return responseOk();
  }
}
