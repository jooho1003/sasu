import { listUsers } from "@/lib/slack/post";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") return Response.json({ error: "Slack 계정 매핑은 팀장만 할 수 있습니다." }, { status: 403 });
  let body: { user_id?: unknown; slack_user_id?: unknown };
  try {
    body = (await request.json()) as { user_id?: unknown; slack_user_id?: unknown };
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (typeof body.user_id !== "string" || typeof body.slack_user_id !== "string" || !body.user_id || !body.slack_user_id) {
    return Response.json({ error: "부서 멤버와 Slack 계정을 선택해주세요." }, { status: 400 });
  }
  let users;
  try {
    users = await listUsers();
  } catch {
    return Response.json({ error: "Slack 멤버 목록을 확인하지 못했습니다." }, { status: 502 });
  }
  if (!users.some((user) => user.id === body.slack_user_id)) return Response.json({ error: "유효한 Slack 멤버를 선택해주세요." }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const result = await supabase.from("members").update({ slack_user_id: body.slack_user_id }).eq("user_id", body.user_id).eq("dept_id", membership.deptId).select("user_id, slack_user_id").maybeSingle<{ user_id: string; slack_user_id: string }>();
  if (result.error || !result.data) return Response.json({ error: "Slack 계정 매핑을 저장하지 못했습니다." }, { status: 500 });
  return Response.json({ ok: true, user_id: result.data.user_id, slack_user_id: result.data.slack_user_id });
}
