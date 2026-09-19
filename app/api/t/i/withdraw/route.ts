import { TrailerInviteOpenBody } from "@/lib/contracts";
import { trailerInvitesEnabled } from "@/lib/features";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { inviteErrorCode } from "@/lib/trailer-invite";

const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  if (!trailerInvitesEnabled()) return Response.json({ error: "invite_unavailable" }, { status: 404, headers });
  const parsed = TrailerInviteOpenBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invite_unavailable" }, { status: 404, headers });
  try {
    const result = await createPublicSupabaseClient().rpc("withdraw_trailer_invite_attempt", { p_token: parsed.data.token, p_email: parsed.data.email });
    if (result.error) {
      const code = inviteErrorCode(result.error);
      return Response.json({ error: code }, { status: code === "unknown" ? 500 : 404, headers });
    }
    return new Response(null, { status: 204, headers });
  } catch { return Response.json({ error: "unknown" }, { status: 500, headers }); }
}
