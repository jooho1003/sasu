import { z } from "zod";

import { SalesReviewFocus } from "@/lib/contracts";
import { kickWorker } from "@/lib/jobs";
import { safeSalesReviewResult } from "@/lib/sales-review";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const CreateRequest = z.strictObject({
  focus: SalesReviewFocus,
  request_id: z.uuid(),
});

type TaskRow = {
  id: string;
  focus: "all" | "price" | "schedule";
  status: "queued" | "processing" | "ready" | "failed";
  status_reason: string | null;
  result: unknown;
  created_at: string;
};
type ActionRow = { task_id: string; action: "approve" | "reject"; created_at: string };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (!membership.consentedAt) return Response.json({ error: "동의 후 이용할 수 있습니다." }, { status: 403 });
  const client = await createServerSupabaseClient();
  const tasks = await client.from("sales_review_tasks")
    .select("id, focus, status, status_reason, result, created_at")
    .eq("dept_id", membership.deptId).order("created_at", { ascending: false }).limit(30);
  if (tasks.error) return Response.json({ error: "검토 목록을 불러오지 못했습니다." }, { status: 500 });
  const rows = (tasks.data ?? []) as TaskRow[];
  const ids = rows.map((row) => row.id);
  let actions: ActionRow[] = [];
  if (ids.length > 0) {
    const read = await client.from("sales_review_actions")
      .select("task_id, action, created_at").in("task_id", ids);
    if (read.error) return Response.json({ error: "팀장 검토 기록을 불러오지 못했습니다." }, { status: 500 });
    actions = (read.data ?? []) as ActionRow[];
  }
  const byTask = new Map(actions.map((action) => [action.task_id, action]));
  return Response.json({
    tasks: rows.map((row) => {
      const result = row.status === "ready" ? safeSalesReviewResult(row.result) : null;
      return {
        id: row.id,
        focus: row.focus,
        status: row.status === "ready" && !result ? "failed" : row.status,
        status_reason: row.status === "ready" && !result ? "citation_invalid" : row.status_reason,
        result,
        action: byTask.get(row.id) ?? null,
        created_at: row.created_at,
      };
    }),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (!membership.consentedAt) return Response.json({ error: "동의 후 이용할 수 있습니다." }, { status: 403 });
  let value: unknown;
  try { value = await request.json(); } catch { return Response.json({ error: "요청 형식을 확인해 주세요." }, { status: 400 }); }
  const parsed = CreateRequest.safeParse(value);
  if (!parsed.success) return Response.json({ error: "검토 초점과 요청 번호를 확인해 주세요." }, { status: 400 });
  const client = await createServerSupabaseClient();
  const result = await client.rpc("request_sales_review", {
    p_dept: membership.deptId,
    p_focus: parsed.data.focus,
    p_request_id: parsed.data.request_id,
  });
  if (result.error) {
    if (result.error.message.includes("sales_review_forbidden")) return Response.json({ error: "이 부서에서 검토를 시작할 수 없습니다." }, { status: 403 });
    if (result.error.message.includes("sales_review_daily_limit")) return Response.json({ error: "오늘 합성 검토 한도 10건에 도달했습니다." }, { status: 429 });
    if (result.error.message.includes("sales_review_request_invalid")) return Response.json({ error: "요청 값을 확인해 주세요." }, { status: 400 });
    return Response.json({ error: "검토를 시작하지 못했습니다." }, { status: 500 });
  }
  kickWorker();
  return Response.json({ task_id: result.data }, { status: 202 });
}
