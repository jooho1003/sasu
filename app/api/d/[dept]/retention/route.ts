import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { reviewError } from "@/lib/reviews";
import { retentionRisk } from "@/lib/retention";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const member = await requireMembership(dept);
  const client = await createServerSupabaseClient();
  const result = await client.rpc("retention_overview", {
    p_dept: member.deptId,
  });
  if (result.error) {
    const error = reviewError(result.error);
    return Response.json(error, { status: error.status });
  }
  const settings = result.data.settings ?? {
    plan: "unknown",
    expires_at: null,
    retention_days: null,
  };
  return Response.json(
    { ...result.data, settings, risk: retentionRisk(settings) },
    { headers: { "cache-control": "no-store" } },
  );
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const member = await requireMembership(dept);
  const body = await request.json().catch(() => null);
  if (
    !body ||
    !["unknown", "free", "paid"].includes(body.plan) ||
    (body.expires_at !== null &&
      !/^\d{4}-\d{2}-\d{2}$/.test(body.expires_at)) ||
    ![null, 90, 365].includes(body.retention_days)
  )
    return Response.json(
      { error: "확인한 요금제와 보존 값을 입력해 주세요." },
      { status: 400 },
    );
  const result = await (
    await createServerSupabaseClient()
  ).rpc("set_retention_settings", {
    p_dept: member.deptId,
    p_plan: body.plan,
    p_expires: body.expires_at,
    p_days: body.retention_days,
  });
  if (result.error) {
    const error = reviewError(result.error);
    return Response.json(error, { status: error.status });
  }
  return Response.json({ ok: true });
}
