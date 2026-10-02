// Design Ref: desktop-companion §4 E15-E16 — web and device actors share AG-07's RLS-bound RPC path.
import { SalesSourceReviewRequest } from "@/lib/contracts";
import type { z } from "zod";
import type { ActorContext, Result } from "@/lib/companion/context";
import { kickWorker } from "@/lib/jobs";
import {
  prepareSalesSourceInputs,
  salesSourceVersions,
  type SalesSourceInputRow,
} from "@/lib/sales-source-review";

type StartResult = Result<{ task_id: string }>;

function failure<T>(status: number, code: string, error: string): Result<T> {
  return { ok: false, status, code, error };
}

function requestFailure(message: string): StartResult {
  if (message.includes("sales_source_forbidden")) return failure<{ task_id: string }>(403, "sales_forbidden", "현재 사수 검토를 요청할 수 없습니다.");
  if (message.includes("sales_source_unavailable")) return failure<{ task_id: string }>(404, "source_unavailable", "원문이 바뀌었거나 확인할 수 없습니다. 다시 선택해 주세요.");
  if (message.includes("sales_source_daily_limit")) return failure<{ task_id: string }>(429, "sales_daily_limit", "오늘 사수 검토 한도 10건에 도달했습니다. 내일 다시 시도해 주세요.");
  if (message.includes("sales_source_too_large")) return failure<{ task_id: string }>(422, "source_too_large", "원문이 사수 검토 한도를 넘었습니다. 원문에서 직접 확인해 주세요.");
  if (message.includes("sales_source_invalid")) return failure<{ task_id: string }>(400, "invalid_input", "요청 번호나 원문 선택을 확인해 주세요.");
  return failure<{ task_id: string }>(500, "sales_start_failed", "사수 검토를 시작하지 못했습니다. 다시 시도해 주세요.");
}

function actorFailure<T>(ctx: ActorContext): Result<T> | null {
  if (ctx.role !== "lead") return failure<T>(403, "lead_only", "팀장만 사수 검토를 이용할 수 있습니다.");
  if (!ctx.consentedAt) return failure<T>(403, "consent_required", "동의한 팀장만 사수 검토를 이용할 수 있습니다.");
  return null;
}

export async function startSalesSourceReview(
  ctx: ActorContext,
  input: z.infer<typeof SalesSourceReviewRequest>,
): Promise<StartResult> {
  const actor = actorFailure<{ task_id: string }>(ctx);
  if (actor) return actor;
  const demo = await ctx.client.rpc("is_demo_department", { p_dept: ctx.deptId });
  if (demo.error || demo.data !== false) return failure<{ task_id: string }>(403, "demo", "이 부서에서는 사수 검토를 이용할 수 없습니다.");

  const { request_id, ...selection } = input;
  const ids = Object.values(selection);
  if (new Set(ids).size !== 4) return failure<{ task_id: string }>(400, "invalid_input", "서로 다른 원문 4건을 선택해 주세요.");
  const read = await ctx.client.rpc("sales_source_review_inputs", {
    p_user: ctx.userId, p_dept: ctx.deptId, p_ids: ids, p_versions: null,
  });
  if (read.error) return failure<{ task_id: string }>(500, "source_read_failed", "원문을 확인하지 못했습니다. 다시 시도해 주세요.");

  let versions: string[];
  try {
    versions = salesSourceVersions(prepareSalesSourceInputs((read.data ?? []) as SalesSourceInputRow[]));
  } catch (cause) {
    return cause instanceof Error && cause.message === "sales_source_too_large"
      ? failure<{ task_id: string }>(422, "source_too_large", "원문 길이나 문단 수가 사수 검토 한도를 넘었습니다. 원문에서 직접 확인해 주세요.")
      : failure<{ task_id: string }>(404, "source_unavailable", "현재 확인할 수 없는 원문이 있습니다. 다시 선택해 주세요.");
  }

  const created = await ctx.client.rpc("request_sales_source_review", {
    p_dept: ctx.deptId, p_ids: ids, p_request_id: request_id, p_versions: versions,
  });
  if (created.error || !created.data) return requestFailure(created.error?.message ?? "");
  kickWorker();
  return { ok: true, status: 202, body: { task_id: created.data as string } };
}

export async function readSalesSourceReviewStatus(
  ctx: ActorContext,
  taskId: string,
): Promise<Result<{ status: string }>> {
  const actor = actorFailure<{ status: string }>(ctx);
  if (actor) return actor;
  const read = await ctx.client.from("sales_source_reviews")
    .select("status")
    .eq("id", taskId)
    .eq("dept_id", ctx.deptId)
    .eq("requested_by", ctx.userId)
    .maybeSingle();
  if (read.error) return { ok: false, status: 500, code: "sales_read_failed", error: "검토를 불러오지 못했습니다. 다시 시도해 주세요." };
  if (!read.data) return { ok: false, status: 404, code: "not_found", error: "현재 확인할 수 없는 검토입니다. 원문을 다시 선택해 주세요." };
  return { ok: true, status: 200, body: { status: read.data.status } };
}
