import { z } from "zod";
import { TrailerScenario } from "@/lib/contracts";
import { trailerPublishEnabled } from "@/lib/features";
import { enqueue, kickWorker } from "@/lib/jobs";
import { registerTrailerGenerateHandler } from "@/lib/pipeline/trailer-generate";
import { registerTrailerGateHandler } from "@/lib/pipeline/trailer-gate";
import { DEFAULT_TRAILER_RUBRIC } from "@/lib/trailer-generation";
import { runTrailerGate } from "@/lib/trailer-gate";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const trailerMessages: Record<string, string> = {
  forbidden: "부서장만 사용할 수 있습니다.", trailer_state_invalid: "지금 상태에서는 처리할 수 없습니다. 새로고침해 주세요.",
  trailer_stale: "다른 곳에서 바뀌었습니다. 새로고침하세요.", trailer_decisions_invalid: "선택한 결정을 쓸 수 없습니다. 원장에서 확인해 주세요.",
  trailer_daily_limit: "오늘 생성 한도를 넘었습니다. 내일 다시 시도해 주세요.", trailer_publishing_disabled: "조직 관리자가 공개 예고편을 허용해야 발행할 수 있습니다.",
  trailer_gate_not_passed: "검사를 통과해야 발행할 수 있습니다.", trailer_not_approved: "모든 항목을 공개 승인한 뒤 발행해 주세요.",
  invalid_scenarios: "가상화본의 형식과 인용을 확인해 주세요.", invalid_apply_url: "공고 주소는 https로 시작해야 합니다.",
  invalid_banned_terms: "가릴 이름은 각각 60자 이하, 최대 50개까지 입력해 주세요.", invalid_rubric: "기준표를 확인해 주세요.",
};

export function trailerError(error: { code?: string; message?: string }) {
  const code = Object.keys(trailerMessages).find((key) => error.message === key) ?? (error.code === "42501" ? "forbidden" : "request_failed");
  return Response.json({ error: code, message: trailerMessages[code] ?? "요청을 처리하지 못했습니다. 새로고침해 상태를 확인해 주세요." }, { status: code === "trailer_daily_limit" ? 429 : error.code === "42501" ? 403 : error.code === "22023" ? 400 : error.code === "P0001" ? 409 : 500 });
}
export const trailerNotFound = () => Response.json({ error: "not_found" }, { status: 404 });
export type TrailerRouteContext = { params: Promise<{ dept: string; id?: string }> };
export async function trailerLead(context: TrailerRouteContext) {
  if (!trailerPublishEnabled()) return trailerNotFound();
  const { dept, id } = await context.params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") return trailerError({ code: "42501", message: "forbidden" });
  return { membership, supabase: await createServerSupabaseClient(), id };
}
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try { const body: unknown = await request.json(); return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {}; }
  catch { return {}; }
}
const queued = z.object({ trailer_id: z.uuid(), updated_at: z.string().min(1) });
export async function queuedTrailer(data: unknown, kind: "generate_trailer" | "check_trailer_gate") {
  const parsed = queued.safeParse(Array.isArray(data) ? data[0] : data);
  if (!parsed.success) return trailerError({});
  try {
    await enqueue(kind, { trailerId: parsed.data.trailer_id }, { dedupeKey: `${parsed.data.trailer_id}:${parsed.data.updated_at}` });
    if (kind === "generate_trailer") registerTrailerGenerateHandler(); else registerTrailerGateHandler();
    kickWorker();
    return Response.json({ trailerId: parsed.data.trailer_id }, { status: 202 });
  } catch { return trailerError({}); }
}

export async function createTrailer(request: Request, context: TrailerRouteContext) {
  const auth = await trailerLead(context); if (auth instanceof Response) return auth;
  const body = await jsonBody(request);
  const parsed = z.object({ decisionIds: z.array(z.uuid()).min(1).max(3), bannedTerms: z.array(z.string().trim().max(60)).max(50), applyUrl: z.url().refine((url) => new URL(url).protocol === "https:").nullable() }).safeParse({ decisionIds: body.decisionIds, bannedTerms: Array.isArray(body.bannedTerms) ? body.bannedTerms.filter((term) => typeof term !== "string" || term.trim()) : body.bannedTerms, applyUrl: body.applyUrl ?? null });
  if (!parsed.success) return trailerError({ code: "22023", message: parsed.error.issues.some((issue) => issue.path[0] === "applyUrl") ? "invalid_apply_url" : parsed.error.issues.some((issue) => issue.path[0] === "bannedTerms") ? "invalid_banned_terms" : "trailer_decisions_invalid" });
  const result = await auth.supabase.rpc("create_trailer_draft", { p_dept: auth.membership.deptId, p_decision_ids: parsed.data.decisionIds, p_banned_terms: parsed.data.bannedTerms, p_apply_url: parsed.data.applyUrl, p_rubric: DEFAULT_TRAILER_RUBRIC });
  return result.error ? trailerError(result.error) : queuedTrailer(result.data, "generate_trailer");
}

export type TrailerAction = "update" | "delete" | "regenerate" | "recheck" | "approve" | "publish" | "unpublish";
export async function trailerAction(request: Request, context: TrailerRouteContext, action: TrailerAction) {
  const auth = await trailerLead(context); if (auth instanceof Response) return auth;
  if (!auth.id || !z.uuid().safeParse(auth.id).success) return trailerNotFound();
  const target = await auth.supabase.from("trailers").select("id").eq("id", auth.id).eq("dept_id", auth.membership.deptId).maybeSingle();
  if (target.error) return trailerError(target.error);
  if (!target.data) return trailerNotFound();
  const args: Record<string, unknown> = { p_trailer: auth.id };
  const names = { update: "update_trailer_scenarios", delete: "delete_trailer", regenerate: "regenerate_trailer", recheck: "request_trailer_recheck", approve: "approve_trailer_items", publish: "publish_trailer", unpublish: "unpublish_trailer" };
  if (action === "update") {
    const body = await jsonBody(request);
    const checked = runTrailerGate(body.scenarios, { sourceTexts: [], properNouns: [] });
    const invalid = checked.violations.filter((violation) => violation.rule === "schema");
    if (invalid.length) return Response.json({ error: "invalid_scenarios", message: trailerMessages.invalid_scenarios, fields: invalid.map((violation) => violation.path) }, { status: 422 });
    const timestamp = z.iso.datetime({ offset: true }).safeParse(body.seenUpdatedAt);
    if (!timestamp.success) return trailerError({ code: "22023", message: "trailer_stale" });
    args.p_scenarios = TrailerScenario.array().parse(body.scenarios); args.p_seen_updated_at = timestamp.data;
  }
  if (action === "approve") {
    const parsed = z.array(z.string().min(1).max(120)).max(200).safeParse((await jsonBody(request)).itemIds);
    if (!parsed.success) return trailerError({ code: "22023", message: "invalid_scenarios" });
    args.p_item_ids = parsed.data;
  }
  const result = await auth.supabase.rpc(names[action], args);
  if (result.error) return trailerError(result.error);
  if (action === "update" || action === "recheck" || action === "regenerate") return queuedTrailer(result.data, action === "regenerate" ? "generate_trailer" : "check_trailer_gate");
  if (action === "publish") return Response.json({ slug: result.data, publicPath: `/t/${result.data}` });
  if (action === "approve") {
    const parsed = z.object({ approved_count: z.number().int().nonnegative(), total_count: z.number().int().nonnegative(), complete: z.boolean() }).safeParse(result.data);
    return parsed.success ? Response.json({ approvedCount: parsed.data.approved_count, totalCount: parsed.data.total_count, complete: parsed.data.complete }) : trailerError({});
  }
  return Response.json({ ok: true });
}
