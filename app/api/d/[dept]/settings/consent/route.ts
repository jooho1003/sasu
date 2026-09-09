import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  let body: { consented?: unknown } = {};
  try {
    body = (await request.json()) as { consented?: unknown };
  } catch {
    // 빈 body는 동의로 처리하지 않고 입력 오류로 거절한다.
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (typeof body.consented !== "boolean") {
    return Response.json({ error: "동의 여부를 선택해주세요." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const result = await supabase
    .from("members")
    .update({
      consented_at: body.consented ? new Date().toISOString() : null,
      consent_version: body.consented ? 1 : null,
    })
    .eq("user_id", membership.userId)
    .eq("dept_id", membership.deptId)
    .select("user_id, consented_at")
    .maybeSingle<{ user_id: string; consented_at: string | null }>();

  if (result.error || !result.data) {
    return Response.json({ error: "동의 상태를 저장하지 못했습니다." }, { status: 500 });
  }
  return Response.json({ ok: true, consented_at: result.data.consented_at });
}
