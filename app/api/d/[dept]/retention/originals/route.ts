import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { originalAccessError } from "@/lib/review-access";

export async function POST(request: Request, { params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  const member = await requireMembership(dept);
  const body = await request.json().catch(() => null);
  if (!body || ![null, 30, 90, 365].includes(body.days))
    return Response.json({ error: "원본 보관 기간을 선택해 주세요." }, { status: 400 });
  const client = await createServerSupabaseClient();
  const result = await client.rpc("set_review_original_retention", { p_dept: member.deptId, p_days: body.days });
  if (result.error) {
    const failure = originalAccessError(result.error);
    return Response.json({ error: failure.error }, { status: failure.status });
  }
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
