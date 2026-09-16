import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { slackAuthorizeUrl, oauthStateHash, slackOAuthConfigured } from "@/lib/slack/installation";
import { metadataBase } from "@/lib/site";
import { orgAdminWritesEnabled } from "@/lib/features";

export async function POST(request: Request) {
  if (!orgAdminWritesEnabled()) return Response.json({ error: "not_found" }, { status: 404 });
  const base = metadataBase();
  if (request.headers.get("origin") !== base.origin) return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  if (!slackOAuthConfigured() || base.protocol !== "https:") return Response.json({ error: "Slack 설치 설정을 준비 중입니다." }, { status: 503 });
  const client = await createServerSupabaseClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const state = randomBytes(32).toString("base64url");
  const started = await client.rpc("begin_slack_installation", { p_hash: oauthStateHash(state) });
  if (started.error || !started.data) return Response.json({ error: "조직 관리자만 Slack을 설치할 수 있습니다." }, { status: 403 });
  (await cookies()).set("sasu-slack-oauth", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/slack/oauth", maxAge: 600 });
  return Response.redirect(slackAuthorizeUrl(state, new URL("/api/slack/oauth/callback", base).href), 303);
}
