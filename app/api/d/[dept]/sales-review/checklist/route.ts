import { SalesReviewSourceSelection } from "@/lib/contracts";
import { buildSalesReviewConditionChecklist } from "@/lib/sales-review-condition-checklist";
import type { SalesReviewSourceRow } from "@/lib/sales-review-sources";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const select = "id,dept_id,content,deleted_at,sources!inner(dept_id,title,kind,active,is_principles)";
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead" || !membership.consentedAt) {
    return Response.json({ error: "동의한 팀장만 조건 확인 질문을 볼 수 있습니다." }, { status: 403, headers: privateHeaders });
  }
  const client = await createServerSupabaseClient();
  const demo = await client.rpc("is_demo_department", { p_dept: membership.deptId });
  if (demo.error || demo.data !== false) {
    return Response.json({ error: "이 부서에서는 조건 확인 질문을 볼 수 없습니다." }, { status: 403, headers: privateHeaders });
  }
  const parsed = SalesReviewSourceSelection.safeParse(await request.json().catch(() => null));
  if (!parsed.success || new Set(Object.values(parsed.data)).size !== 4) {
    return Response.json({ error: "서로 다른 원문 4건을 지정해 주세요." }, { status: 400, headers: privateHeaders });
  }
  // Design Ref: §4 — session RLS is the only visibility decision; read all four sources afresh.
  const read = await client.from("items").select(select)
    .eq("dept_id", membership.deptId).is("deleted_at", null)
    .eq("sources.active", true).in("id", Object.values(parsed.data));
  if (read.error) return Response.json({ error: "원문을 확인하지 못했습니다." }, { status: 500, headers: privateHeaders });
  try {
    const checklist = buildSalesReviewConditionChecklist(parsed.data, (read.data ?? []) as SalesReviewSourceRow[], membership.deptId);
    return Response.json(checklist, { headers: privateHeaders });
  } catch (cause) {
    if (cause instanceof Error && cause.message === "sales_review_checklist_too_large") {
      return Response.json({ error: "원문이나 줄의 길이가 확인 한도를 넘었습니다. 원문에서 직접 확인해 주세요." }, { status: 422, headers: privateHeaders });
    }
    if (cause instanceof Error && cause.message === "sales_review_source_unavailable") {
      return Response.json({ error: "현재 확인할 수 없는 원문이 있습니다. 다시 선택해 주세요." }, { status: 404, headers: privateHeaders });
    }
    return Response.json({ error: "조건 확인 질문을 준비하지 못했습니다." }, { status: 500, headers: privateHeaders });
  }
}
