import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const TARGET_STATUSES = ["decided", "deferred", "rejected", "open"] as const;

type CardStatus = "open" | "decided" | "deferred" | "rejected" | "needs_review";
type TargetStatus = (typeof TARGET_STATUSES)[number];

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

const ALLOWED_TRANSITIONS: Record<CardStatus, readonly TargetStatus[]> = {
  open: ["decided", "deferred", "rejected"],
  decided: [],
  deferred: ["open"],
  rejected: ["open"],
  needs_review: ["open", "rejected"],
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
    message: `이미 ${decision.decided_by_name}이(가) ${formatDecisionTime(decision.decided_at)}에 결정했습니다 → 원장 #${ledgerNumber}`,
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

  if (!ALLOWED_TRANSITIONS[card.status].includes(body.status)) {
    return Response.json(
      { error: `${card.status} 상태에서 ${body.status} 상태로 바꿀 수 없습니다.` },
      { status: 409 },
    );
  }

  if (body.status === "open" && membership.role !== "lead") {
    return Response.json({ error: "카드 재개는 팀장만 할 수 있습니다." }, { status: 403 });
  }

  const now = new Date();

  if (body.status !== "decided") {
    const updateResult = await supabase
      .from("decision_requests")
      .update({
        status: body.status,
        closed_at: body.status === "rejected" ? now.toISOString() : null,
      })
      .eq("id", card.id)
      .eq("status", card.status)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (updateResult.error || !updateResult.data) {
      return Response.json(
        { error: "카드 상태가 이미 바뀌었습니다. 화면을 새로고침해주세요." },
        { status: 409 },
      );
    }

    return Response.json({ ok: true, status: body.status });
  }

  const outcome = typeof body.outcome === "string" ? body.outcome.trim() : "";
  const rationale =
    typeof body.rationale === "string" ? body.rationale.trim() : "";
  if (!outcome || !rationale) {
    return Response.json(
      { error: "결정 결과와 사유를 모두 입력해주세요." },
      { status: 400 },
    );
  }

  const openedAt = card.opened_at ? new Date(card.opened_at).getTime() : now.getTime();
  const leadTimeMin = Math.max(0, Math.floor((now.getTime() - openedAt) / 60_000));
  const insertResult = await supabase
    .from("decisions")
    .insert({
      dept_id: membership.deptId,
      request_id: card.id,
      decided_by: membership.userId,
      decided_by_name: membership.displayName,
      decided_at: now.toISOString(),
      outcome,
      rationale,
      supersedes_id: null,
      lead_time_min: leadTimeMin,
    })
    .select("id, decided_by_name, decided_at")
    .single<DecisionRow>();

  if (insertResult.error) {
    if (insertResult.error.code === "23505") {
      const duplicate = await findExistingDecision(supabase, card.id);
      if (!duplicate.error && duplicate.data) {
        return duplicateResponse(duplicate.data);
      }
    }

    return Response.json(
      { error: "결정을 원장에 기록하지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  const closeResult = await supabase
    .from("decision_requests")
    .update({ status: "decided", closed_at: now.toISOString() })
    .eq("id", card.id)
    .eq("status", "open");

  if (closeResult.error) {
    return Response.json(
      { error: "결정은 기록됐지만 카드 상태를 닫지 못했습니다. 화면을 새로고침해주세요." },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    duplicate: false,
    decision_id: insertResult.data.id,
    message: `결정이 원장 #${insertResult.data.id.slice(0, 8)}에 기록됐습니다.`,
  });
}
