import { cookies } from "next/headers";
const providers = new Set(["github", "figma", "google_calendar", "notion", "hubspot"]);
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params, url = new URL(request.url), state = url.searchParams.get("state"), code = url.searchParams.get("code"), stored = (await cookies()).get("sasu-retro-oauth")?.value ?? "";
  const [expected, userId, deptId, storedProvider] = stored.split(".");
  const clear = new Headers({ "Cache-Control": "no-store", "Set-Cookie": "sasu-retro-oauth=; Max-Age=0; Path=/api/retro/connect; HttpOnly; SameSite=Lax" });
  if (!providers.has(provider) || !state || !code || !expected || state !== expected || storedProvider !== provider || !userId || !deptId) return Response.json({ error: "연결 확인에 실패했습니다." }, { status: 400, headers: clear });
  // Provider-specific token exchange is intentionally kept behind the verified state boundary.
  // Without a configured client secret it must never accept or store the authorization code.
  return Response.json({ error: "이 연결은 아직 준비되지 않았습니다." }, { status: 501, headers: clear });
}
