import { label } from "@/lib/labels";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const TARGET_STATUSES = ["decided", "deferred", "rejected", "open"] as const;

type CardStatus = "open" | "decided" | "deferred" | "rejected" | "needs_review";
type TargetStatus = (typeof TARGET_STATUSES)[number];
type DecisionAction = "decide" | "defer" | "reject" | "reopen";

type DecisionBody = {
  status?: unknown;
  outcome?: unknown;
  rationale?: unknown;
};

type CardRow = {
  id: string;
  dept_id: string;
  assignee_id: string | null;
  status: CardStatus;
  opened_at: string | null;
};

type DecisionRow = {
  id: string;
  decided_by_name: string;
  decided_at: string | null;
};

type DecisionRpcResult = {
  ok: boolean;
  duplicate: boolean;
  status: TargetStatus;
  decision_id: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
};

const ACTION_BY_STATUS: Record<TargetStatus, DecisionAction> = {
  decided: "decide",
  deferred: "defer",
  rejected: "reject",
  open: "reopen",
};

function isTargetStatus(value: unknown): value is TargetStatus {
  return TARGET_STATUSES.some((status) => status === value);
}

function formatDecisionTime(value: string | null): string {
  if (!value) {
    return "시각 미상";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function duplicateResponse(decision: DecisionRow) {
  const ledgerNumber = decision.id.slice(0, 8);
  return Response.json({
    ok: true,
    duplicate: true,
    decision_id: decision.id,
    message: `이미 ${decision.decided_by_name}이(가) ${formatDecisionTime(decision.decided_at)}에 결정했습니다 → 결정 기록 #${ledgerNumber}`,
  });
}

async function findExistingDecision(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  requestId: string,
): Promise<{ data: DecisionRow | null; error: unknown }> {
  const result = await supabase
    .from("decisions")
    .select("id, decided_by_name, decided_at")
    .eq("request_id", requestId)
    .maybeSingle<DecisionRow>();

  return { data: result.data, error: result.error };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const cardResult = await supabase
    .from("decision_requests")
    .select("id, dept_id, assignee_id, status, opened_at")
    .eq("id", id)
    .maybeSingle<CardRow>();

  if (cardResult.error) {
    return Response.json(
      { error: "결정 카드를 확인하지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  if (!cardResult.data) {
    return Response.json({ error: "결정 카드를 찾을 수 없습니다." }, { status: 404 });
  }

  const card = cardResult.data;
  const membership = await requireMembership(card.dept_id);
  if (membership.role !== "lead" && card.assignee_id !== membership.userId) {
    return Response.json(
      { error: "담당자 또는 팀장만 이 카드를 처리할 수 있습니다." },
      { status: 403 },
    );
  }

  const existing = await findExistingDecision(supabase, card.id);
  if (existing.error) {
    return Response.json(
      { error: "기존 결정을 확인하지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
  if (existing.data) {
    return duplicateResponse(existing.data);
  }

  let body: DecisionBody;
  try {
    body = (await request.json()) as DecisionBody;
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (!isTargetStatus(body.status)) {
    return Response.json({ error: "지원하지 않는 카드 상태입니다." }, { status: 400 });
  }

  if (body.status === "open" && membership.role !== "lead") {
    return Response.json({ error: "카드 재개는 팀장만 할 수 있습니다." }, { status: 403 });
  }

  const outcome = typeof body.outcome === "string" ? body.outcome.trim() : "";
  const rationale =
    typeof body.rationale === "string" ? body.rationale.trim() : "";
  if (body.status === "decided" && (!outcome || !rationale)) {
    return Response.json(
      { error: "결정 결과와 사유를 모두 입력해주세요." },
      { status: 400 },
    );
  }

  const result = await supabase.rpc("decide_request", {
    p_request: card.id,
    p_action: ACTION_BY_STATUS[body.status],
    p_outcome: outcome,
    p_rationale: rationale,
  });

  if (result.error) {
    if (result.error.code === "42501") {
      return Response.json(
        { error: body.status === "open" ? "카드 재개는 팀장만 할 수 있습니다." : "담당자 또는 팀장만 이 카드를 처리할 수 있습니다." },
        { status: 403 },
      );
    }
    if (result.error.code === "23514") {
      return Response.json(
        { error: `${label("cardStatus", card.status)} 상태에서는 ${label("cardStatus", body.status)} 상태로 바꿀 수 없습니다. 화면을 새로 고쳐 주세요.` },
        { status: 409 },
      );
    }
    if (result.error.code === "P0002") {
      return Response.json({ error: "결정 카드를 찾을 수 없습니다." }, { status: 404 });
    }
    if (result.error.code === "22023") {
      return Response.json(
        { error: "결정 결과와 사유를 모두 입력해주세요." },
        { status: 400 },
      );
    }
    return Response.json(
      { error: body.status === "decided" ? "결정을 기록에 남기지 못했습니다. 잠시 후 다시 시도해주세요." : "카드 상태가 이미 바뀌었습니다. 화면을 새로고침해주세요." },
      { status: 500 },
    );
  }

  const rpcResult = result.data as DecisionRpcResult | null;
  if (!rpcResult?.ok) {
    return Response.json(
      { error: "카드 상태가 이미 바뀌었습니다. 화면을 새로고침해주세요." },
      { status: 409 },
    );
  }

  if (
    rpcResult.duplicate &&
    rpcResult.decision_id &&
    rpcResult.decided_by_name
  ) {
    return duplicateResponse({
      id: rpcResult.decision_id,
      decided_by_name: rpcResult.decided_by_name,
      decided_at: rpcResult.decided_at,
    });
  }

  if (body.status !== "decided") {
    return Response.json({ ok: true, status: rpcResult.status });
  }

  if (!rpcResult.decision_id) {
    return Response.json(
      { error: "결정을 기록에 남기지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    duplicate: false,
    decision_id: rpcResult.decision_id,
    message: `결정이 결정 기록 #${rpcResult.decision_id.slice(0, 8)}에 기록됐습니다.`,
  });
}
