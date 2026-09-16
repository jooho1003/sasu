import { after as nextAfter } from "next/server";

import { verifySlackSignature } from "@/lib/slack/verify";
import { buildDecisionModal } from "@/lib/slack/blocks";
import { openModal, postMessage, updateMessage } from "@/lib/slack/post";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

import { slackWorkspaceForTeam, withSlackCredentials, currentSlackWorkspace } from "@/lib/slack/workspace";
function after(action: () => Promise<unknown>) {
  const credentials = currentSlackWorkspace() ?? { token: null, teamId: null, orgId: null };
  nextAfter(async () => { await withSlackCredentials(credentials, action); });
}
export const dynamic = "force-dynamic";

type InteractionPayload = {
  team?: { id?: string };
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
  origin_item_id: string | null;
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

type DecisionRpcResult = {
  ok: boolean;
  duplicate: boolean;
  status: "decided" | "deferred" | "rejected" | "open";
  decision_id: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
};

type OriginThread = {
  channelId: string;
  messageTs: string;
};

type OriginItemRow = {
  external_ref: string | null;
  sources:
    | { kind: string; external_id: string }
    | { kind: string; external_id: string }[];
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

function relation<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

function appBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/u, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;
  return "http://localhost:3000";
}

async function originThreadForCard(
  client: ReturnType<typeof createServiceSupabaseClient>,
  card: CardRow,
): Promise<OriginThread | null> {
  if (!card.origin_item_id) return null;

  const result = await client
    .from("items")
    .select("external_ref, sources!inner(kind, external_id)")
    .eq("id", card.origin_item_id)
    .maybeSingle<OriginItemRow>();
  if (result.error) {
    throw new SlackInteractionError("원문 스레드 정보를 확인하지 못했습니다.");
  }

  if (!result.data?.external_ref) return null;
  const source = relation(result.data.sources);
  return source.kind === "slack_channel"
    ? { channelId: source.external_id, messageTs: result.data.external_ref }
    : null;
}

async function authorizedCard(
  client: ReturnType<typeof createServiceSupabaseClient>,
  requestId: string,
  slackUserId: string,
): Promise<{ card: CardRow; member: MemberRow }> {
  const cardResult = await client
    .from("decision_requests")
    .select("id, dept_id, origin_item_id, title, recommendation, assignee_id, status, opened_at")
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
    .eq("slack_team_id", currentSlackWorkspace()?.teamId ?? "")
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

function messageBlocks(message: string): Array<Record<string, unknown>> {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: message },
    },
  ];
}

function formatDecisionTime(value: string | null): string {
  if (!value) return "시각 미상";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

async function recordDecision(args: {
  requestId: string;
  slackUserId: string;
  status: DecisionStatus;
  outcome: string;
  rationale: string;
}): Promise<{ decisionId: string | null; message: string; created: boolean; origin: OriginThread | null }> {
  const client = createServiceSupabaseClient();
  const { card, member } = await authorizedCard(
    client,
    args.requestId,
    args.slackUserId,
  );

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

  const action = args.status === "decided"
    ? "decide"
    : args.status === "deferred"
      ? "defer"
      : "reject";
  const decisionResult = await client.rpc("decide_request_as", {
    p_user: member.user_id,
    p_request: card.id,
    p_action: action,
    p_outcome: outcome,
    p_rationale: rationale,
  });

  if (decisionResult.error) {
    if (decisionResult.error.code === "42501") {
      throw new SlackInteractionError("이 카드를 처리할 권한이 없습니다.");
    }
    if (decisionResult.error.code === "23514") {
      throw new SlackInteractionError("카드 상태가 이미 바뀌었습니다.");
    }
    throw new SlackInteractionError("카드를 처리하지 못했습니다.");
  }

  const result = decisionResult.data as DecisionRpcResult | null;
  if (!result?.ok) {
    throw new SlackInteractionError("카드를 처리하지 못했습니다.");
  }

  if (result.duplicate && result.decision_id && result.decided_by_name) {
    return {
      decisionId: result.decision_id,
      message: `이미 ${result.decided_by_name}이(가) ${formatDecisionTime(result.decided_at)}에 결정했습니다 → 원장 #${result.decision_id.slice(0, 8)}`,
      created: false,
      origin: null,
    };
  }

  if (args.status !== "decided") {
    return {
      decisionId: null,
      message: args.status === "deferred" ? "카드를 보류했습니다." : "카드를 반려했습니다.",
      created: true,
      origin: await originThreadForCard(client, card),
    };
  }

  if (!result.decision_id) {
    throw new SlackInteractionError("결정을 원장에 기록하지 못했습니다.");
  }

  return {
    decisionId: result.decision_id,
    message: "결정을 원장에 기록했습니다.",
    created: true,
    origin: await originThreadForCard(client, card),
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

async function handleConsentAction(
  payload: InteractionPayload,
): Promise<Response> {
  const action = payload.actions?.[0];
  const slackUserId = payload.user?.id;
  const deptId = action?.value;
  if (action?.action_id !== "sasu_consent" || !slackUserId || !deptId) {
    return responseOk();
  }

  const client = createServiceSupabaseClient();
  const result = await client.rpc("consent_via_slack_for_team", {
    p_team: currentSlackWorkspace()?.teamId,
    p_slack_user: slackUserId,
    p_dept: deptId,
  });
  const message = result.error
    ? "동의 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요."
    : result.data === true
      ? "동의가 기록되었습니다. 이제부터 연결된 채널의 내 발언이 사수에 저장됩니다."
      : "Slack 계정이 사수 멤버십에 연결되어 있지 않습니다. 부서 세팅에서 계정 연결이 필요합니다.";
  const channel = payload.container?.channel_id;
  const messageTs = payload.container?.message_ts;

  if (channel && messageTs) {
    after(() =>
      updateMessage({
        channel,
        ts: messageTs,
        text: message,
        blocks: messageBlocks(message),
      }).catch(() => undefined),
    );
    return responseOk();
  }

  return Response.json({
    replace_original: true,
    text: message,
  });
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
      const baseUrl = appBaseUrl();
      const deptPath = typeof metadata.deptId === "string" ? `/d/${metadata.deptId}` : "";
      const ledgerHref = `${baseUrl}${deptPath}/ledger#decision-${result.decisionId ?? metadata.requestId}`;
      after(() =>
        Promise.all([
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
          }),
          ...(result.created && result.origin
            ? [
                postMessage({
                  channel: result.origin.channelId,
                  thread_ts: result.origin.messageTs,
                  text: `✅ ${result.message} · <${ledgerHref}|원장에서 보기>`,
                  blocks: [],
                }),
              ]
            : []),
        ]).catch(() => undefined),
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

  const workspace = await slackWorkspaceForTeam(createServiceSupabaseClient(), payload.team?.id);
  if (!workspace) return responseOk();
  return withSlackCredentials(workspace, () => handleInteraction(payload));
}
async function handleInteraction(payload: InteractionPayload): Promise<Response> {
  try {
    if (payload.type === "block_actions") {
      if (payload.actions?.[0]?.action_id === "sasu_consent") {
        return await handleConsentAction(payload);
      }
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
