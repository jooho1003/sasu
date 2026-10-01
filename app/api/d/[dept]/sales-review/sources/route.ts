import { SalesReviewSourceSelection } from "@/lib/contracts";
import {
  buildSalesReviewSourcePreview,
  salesReviewSourceCandidates,
  type SalesReviewSourceRow,
} from "@/lib/sales-review-sources";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const select = "id,dept_id,content,deleted_at,sources!inner(dept_id,title,kind,active,is_principles)";
const privateHeaders = { "Cache-Control": "private, no-store" };

async function context(dept: string) {
  const membership = await requireMembership(dept);
  if (membership.role !== "lead" || !membership.consentedAt) return null;
  const client = await createServerSupabaseClient();
  const demo = await client.rpc("is_demo_department", { p_dept: membership.deptId });
  if (demo.error || demo.data !== false) return null;
  return { membership, client };
}

export async function GET(_request: Request, { params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  const current = await context(dept);
  if (!current) return Response.json({ error: "동의한 팀장만 원문을 연결할 수 있습니다." }, { status: 403, headers: privateHeaders });
  const recent = current.client.from("items").select(select)
    .eq("dept_id", current.membership.deptId).is("deleted_at", null)
    .eq("sources.active", true).order("created_at", { ascending: false }).limit(100);
  const principles = current.client.from("items").select(select)
    .eq("dept_id", current.membership.deptId).is("deleted_at", null)
    .eq("sources.active", true).eq("sources.is_principles", true)
    .order("created_at", { ascending: false }).limit(50);
  const [recentRead, principleRead] = await Promise.all([recent, principles]);
  if (recentRead.error || principleRead.error) return Response.json({ error: "원문 목록을 불러오지 못했습니다." }, { status: 500, headers: privateHeaders });
  const rows = new Map<string, SalesReviewSourceRow>();
  for (const row of [...(recentRead.data ?? []), ...(principleRead.data ?? [])] as SalesReviewSourceRow[]) rows.set(row.id, row);
  return Response.json({ candidates: salesReviewSourceCandidates([...rows.values()], current.membership.deptId) }, { headers: privateHeaders });
}

export async function POST(request: Request, { params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  const current = await context(dept);
  if (!current) return Response.json({ error: "동의한 팀장만 원문을 연결할 수 있습니다." }, { status: 403, headers: privateHeaders });
  const body = SalesReviewSourceSelection.safeParse(await request.json().catch(() => null));
  if (!body.success || new Set(Object.values(body.data)).size !== 4) {
    return Response.json({ error: "서로 다른 원문 4건을 지정해 주세요." }, { status: 400, headers: privateHeaders });
  }
  const ids = Object.values(body.data);
  // Design Ref: §1 — current session RLS is the visibility decision; never use service role here.
  const read = await current.client.from("items").select(select)
    .eq("dept_id", current.membership.deptId).is("deleted_at", null)
    .eq("sources.active", true).in("id", ids);
  if (read.error) return Response.json({ error: "원문을 확인하지 못했습니다." }, { status: 500, headers: privateHeaders });
  try {
    const preview = buildSalesReviewSourcePreview(body.data, (read.data ?? []) as SalesReviewSourceRow[], current.membership.deptId);
    return Response.json(preview, { headers: privateHeaders });
  } catch {
    return Response.json({ error: "현재 확인할 수 없는 원문이 있습니다. 다시 선택해 주세요." }, { status: 404, headers: privateHeaders });
  }
}
