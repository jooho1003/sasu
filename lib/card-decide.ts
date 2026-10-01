// Design Ref: desktop-companion §4.1 W04 — 카드 행동은 웹과 기기가 동일한 RPC로 처리한다.
import { label } from "@/lib/labels";
import type { ActorContext, Result } from "@/lib/companion/context";
import type { SupabaseClient } from "@supabase/supabase-js";

const TARGET_STATUSES = ["decided", "deferred", "rejected", "open"] as const;
type TargetStatus = (typeof TARGET_STATUSES)[number];
type DecisionAction = "decide" | "defer" | "reject" | "reopen";
type CardStatus = TargetStatus | "needs_review";
type CardRow = { id: string; dept_id: string; assignee_id: string | null; status: CardStatus };
type DecisionRow = { id: string; decided_by_name: string; decided_at: string | null };
type DecisionRpcResult = { ok: boolean; duplicate: boolean; status: TargetStatus; decision_id: string | null; decided_by_name: string | null; decided_at: string | null };
export type DecideBody = { status?: unknown; outcome?: unknown; rationale?: unknown };
export type DecideResponse = { ok: true; duplicate?: boolean; decision_id?: string; status?: TargetStatus; message?: string };
const ACTION_BY_STATUS: Record<TargetStatus, DecisionAction> = { decided: "decide", deferred: "defer", rejected: "reject", open: "reopen" };
function isTargetStatus(value: unknown): value is TargetStatus { return TARGET_STATUSES.some((status) => status === value); }
function formatDecisionTime(value: string | null): string { return value ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value)) : "시각 미상"; }
function duplicateResponse(decision: DecisionRow): DecideResponse { return { ok: true, duplicate: true, decision_id: decision.id, message: `이미 ${decision.decided_by_name}이(가) ${formatDecisionTime(decision.decided_at)}에 결정했습니다 → 결정 기록 #${decision.id.slice(0, 8)}` }; }
function failure(status: number, code: string, error: string): Result<DecideResponse> { return { ok: false, status, code, error }; }

export async function readCardDept(client: SupabaseClient, cardId: string): Promise<string | null> {
  const result = await client.from("decision_requests").select("dept_id").eq("id", cardId).maybeSingle<{ dept_id: string }>();
  return result.error || !result.data ? null : result.data.dept_id;
}

export async function decideCard(ctx: ActorContext, cardId: string, body: DecideBody): Promise<Result<DecideResponse>> {
  const cardResult = await ctx.client.from("decision_requests").select("id, dept_id, assignee_id, status").eq("id", cardId).maybeSingle<CardRow>();
  if (cardResult.error) return failure(500, "card_read_failed", "결정 카드를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");
  const card = cardResult.data;
  if (!card || card.dept_id !== ctx.deptId) return failure(404, "card_not_found", "결정 카드를 찾을 수 없습니다.");
  if (ctx.role !== "lead" && card.assignee_id !== ctx.userId) return failure(403, "card_action_forbidden", "담당자 또는 팀장만 이 카드를 처리할 수 있습니다.");
  if (card.status === "needs_review" && ctx.role !== "lead") return failure(403, "card_action_forbidden", "팀장만 이 카드를 처리할 수 있습니다.");
  const existing = await ctx.client.from("decisions").select("id, decided_by_name, decided_at").eq("request_id", card.id).maybeSingle<DecisionRow>();
  if (existing.error) return failure(500, "decision_read_failed", "기존 결정을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");
  if (existing.data) return { ok: true, status: 200, body: duplicateResponse(existing.data) };
  if (!isTargetStatus(body.status)) return failure(400, "invalid_status", "지원하지 않는 카드 상태입니다.");
  if (body.status === "open" && ctx.role !== "lead") return failure(403, "reopen_forbidden", "카드 재개는 팀장만 할 수 있습니다.");
  const outcome = typeof body.outcome === "string" ? body.outcome.trim() : ""; const rationale = typeof body.rationale === "string" ? body.rationale.trim() : "";
  if (body.status === "decided" && (!outcome || !rationale)) return failure(400, "decision_fields_required", "결정 결과와 사유를 모두 입력해주세요.");
  const result = await ctx.client.rpc("decide_request", { p_request: card.id, p_action: ACTION_BY_STATUS[body.status], p_outcome: outcome, p_rationale: rationale });
  if (result.error) {
    if (result.error.code === "42501") return failure(403, "card_action_forbidden", body.status === "open" ? "카드 재개는 팀장만 할 수 있습니다." : "담당자 또는 팀장만 이 카드를 처리할 수 있습니다.");
    if (result.error.code === "23514") return failure(409, "invalid_transition", `${label("cardStatus", card.status)} 상태에서는 ${label("cardStatus", body.status)} 상태로 바꿀 수 없습니다. 화면을 새로 고쳐 주세요.`);
    if (result.error.code === "P0002") return failure(404, "card_not_found", "결정 카드를 찾을 수 없습니다.");
    if (result.error.code === "22023") return failure(400, "decision_fields_required", "결정 결과와 사유를 모두 입력해주세요.");
    return failure(500, "decision_write_failed", body.status === "decided" ? "결정을 기록에 남기지 못했습니다. 잠시 후 다시 시도해주세요." : "카드 상태가 이미 바뀌었습니다. 화면을 새로고침해주세요.");
  }
  const saved = result.data as DecisionRpcResult | null;
  if (!saved?.ok) return failure(409, "card_changed", "카드 상태가 이미 바뀌었습니다. 화면을 새로고침해주세요.");
  if (saved.duplicate && saved.decision_id && saved.decided_by_name) return { ok: true, status: 200, body: duplicateResponse({ id: saved.decision_id, decided_by_name: saved.decided_by_name, decided_at: saved.decided_at }) };
  if (body.status !== "decided") return { ok: true, status: 200, body: { ok: true, status: saved.status } };
  if (!saved.decision_id) return failure(500, "decision_write_failed", "결정을 기록에 남기지 못했습니다. 잠시 후 다시 시도해주세요.");
  return { ok: true, status: 200, body: { ok: true, duplicate: false, decision_id: saved.decision_id, message: `결정이 결정 기록 #${saved.decision_id.slice(0, 8)}에 기록됐습니다.` } };
}
