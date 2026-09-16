import { createServerSupabaseClient } from "@/lib/supabase/server";
import { slackOAuthConfigured } from "@/lib/slack/installation";
import { metadataBase } from "@/lib/site";
import { orgAdminReadEnabled, orgAdminWritesEnabled } from "@/lib/features";
export async function GET() {
  if (!orgAdminReadEnabled()) return Response.json({ error: "not_found" }, { status: 404 });
  const client = await createServerSupabaseClient();
  const result = await client.rpc("admin_slack_installation");
  if (result.error) return Response.json({ error: "조직 관리자 권한이 필요합니다." }, { status: 403 });
  return Response.json({ configured: orgAdminWritesEnabled() && slackOAuthConfigured() && metadataBase().protocol === "https:", installation: result.data }, { headers: { "Cache-Control": "no-store" } });
}
