import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { encryptSlackToken, exchangeSlackCode, oauthStateHash } from "@/lib/slack/installation";
import { metadataBase } from "@/lib/site";
import { mask } from "@/lib/mask";
import { orgAdminWritesEnabled } from "@/lib/features";

export async function GET(request: Request) {
  if (!orgAdminWritesEnabled()) return Response.json({ error: "not_found" }, { status: 404 });
  const base = metadataBase();
  const done = (status: string) => Response.redirect(new URL(`/admin/sources?slack=${status}`, base), 303);
  const url = new URL(request.url), state = url.searchParams.get("state") ?? "";
  const jar = await cookies(), expected = jar.get("sasu-slack-oauth")?.value ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(expected) || !timingSafeEqual(Buffer.from(state), Buffer.from(expected))) return done("invalid_state");
  jar.set("sasu-slack-oauth", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/slack/oauth", maxAge: 0 });
  const client = await createServerSupabaseClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return done("invalid_state");
  const hash = oauthStateHash(state);
  const consumed = await client.rpc("consume_slack_installation_state", { p_hash: hash });
  if (consumed.error || typeof consumed.data !== "string") return done("invalid_state");
  if (url.searchParams.has("error")) return done("cancelled");
  const code = url.searchParams.get("code");
  if (!code || code.length > 2048) return done("failed");
  try {
    const installation = await exchangeSlackCode(code, new URL("/api/slack/oauth/callback", base).href);
    const encrypted = encryptSlackToken(installation.token, consumed.data, installation.teamId);
    // Credential ingestion adapter: only a validated Slack OAuth response reaches
    // this service-only write; dashboard/settings reads continue to use sessions.
    const saved = await createServiceSupabaseClient().rpc("complete_slack_installation", {
      p_hash: hash, p_actor: user.id, p_org: consumed.data, p_team: installation.teamId,
      p_name: mask(installation.teamName), p_bot: installation.botUserId, p_encrypted: encrypted, p_scopes: installation.scopes,
    });
    if (saved.error?.code === "23505") return done("workspace_conflict");
    if (saved.error || saved.data !== true) return done("failed");
    return done("installed");
  } catch { return done("failed"); }
}
