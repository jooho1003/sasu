import { withSlackDepartment } from "@/lib/slack/workspace";
import { listConversations, listUsers } from "@/lib/slack/post";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  const supabase = await createServerSupabaseClient();
  const [membersResult, sourcesResult] = await Promise.all([
    supabase
      .from("members")
      .select("user_id, display_name, role, slack_user_id, consented_at, consent_version")
      .eq("dept_id", membership.deptId),
    supabase
      .from("sources")
      .select("id, kind, external_id, title, visibility, active, last_synced_at, last_error, auto_sync, import_version")
      .eq("dept_id", membership.deptId)
      .is("root_id", null)
      .order("created_at", { ascending: true }),
  ]);

  if (membersResult.error || sourcesResult.error) {
    return Response.json({ error: "부서 세팅을 불러오지 못했습니다." }, { status: 500 });
  }

  let channels: Array<{ id: string; name: string; isPrivate: boolean }> = [];
  let slackUsers: Array<{ id: string; displayName: string }> = [];
  let channelsAvailable = true;
  try {
    [channels, slackUsers] = await withSlackDepartment(supabase, membership.deptId, () => Promise.all([listConversations(), listUsers()]));
  } catch {
    channelsAvailable = false;
  }

  return Response.json({
    current_user_id: membership.userId,
    role: membership.role,
    members: membersResult.data ?? [],
    sources: sourcesResult.data ?? [],
    channels,
    slack_users: slackUsers,
    channels_available: channelsAvailable,
  });
}
