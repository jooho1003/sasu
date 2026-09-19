import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireMembership } from "@/lib/supabase/membership";
const providers = new Set(["github", "figma", "google_calendar", "notion", "hubspot"]);
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!providers.has(provider)) return Response.json({ error: "지원하지 않는 연결입니다." }, { status: 404 });
  const url = new URL(request.url), dept = url.searchParams.get("dept") ?? "";
  const member = await requireMembership(dept), state = randomBytes(32).toString("base64url");
  const store = await cookies(); store.set("sasu-retro-oauth", `${state}.${member.userId}.${member.deptId}.${provider}`, { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", maxAge: 600, path: "/api/retro/connect" });
  const auth = process.env[`RETRO_${provider.toUpperCase()}_AUTH_URL`];
  const clientId = process.env[`RETRO_${provider.toUpperCase()}_CLIENT_ID`];
  if (!auth || !clientId) return Response.json({ error: "이 연결은 아직 준비되지 않았습니다." }, { status: 501 });
  const redirect = new URL(auth); redirect.searchParams.set("client_id", clientId); redirect.searchParams.set("state", state); redirect.searchParams.set("redirect_uri", `${url.origin}/api/retro/connect/${provider}/callback`); redirect.searchParams.set("response_type", "code");
  return Response.redirect(redirect);
}
