import { z } from "zod";

import { safeSalesReviewResult } from "@/lib/sales-review";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const ReviewRequest = z.strictObject({ action: z.enum(["approve", "reject"]) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string; taskId: string }> },
) {
  const { dept, taskId } = await params;
  const membership = await requireMembership(dept);
  if (!membership.consentedAt || membership.role !== "lead") {
    return Response.json({ error: "팀장만 검토할 수 있습니다." }, { status: 403 });
  }
  if (!z.uuid().safeParse(taskId).success) return Response.json({ error: "작업 번호를 확인해 주세요." }, { status: 400 });
  let value: unknown;
  try { value = await request.json(); } catch { return Response.json({ error: "요청 형식을 확인해 주세요." }, { status: 400 }); }
  const parsed = ReviewRequest.safeParse(value);
  if (!parsed.success) return Response.json({ error: "내부 확인하거나 돌려보낼지 선택해 주세요." }, { status: 400 });
  const client = await createServerSupabaseClient();
  const task = await client.from("sales_review_tasks")
    .select("status, result")
    .eq("id", taskId).eq("dept_id", membership.deptId)
    .maybeSingle<{ status: string; result: unknown }>();
  if (task.error) return Response.json({ error: "검토안을 확인하지 못했습니다." }, { status: 500 });
  if (!task.data || task.data.status !== "ready" || !safeSalesReviewResult(task.data.result)) {
    return Response.json({ error: "근거를 확인한 완료 작업만 검토할 수 있습니다." }, { status: 409 });
  }
  const result = await client.rpc("review_sales_task", { p_task: taskId, p_action: parsed.data.action });
  if (result.error) {
    if (result.error.message.includes("sales_review_already_reviewed")) return Response.json({ error: "이미 검토한 작업입니다." }, { status: 409 });
    if (result.error.message.includes("sales_review_action_forbidden")) return Response.json({ error: "이 작업을 검토할 수 없습니다." }, { status: 403 });
    return Response.json({ error: "팀장 검토를 기록하지 못했습니다." }, { status: 500 });
  }
  return Response.json({ action_id: result.data }, { status: 201 });
}
