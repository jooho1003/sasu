import { TrailerInviteOpenBody } from "@/lib/contracts";
import { trailerInvitesEnabled } from "@/lib/features";
import { inviteErrorCode, parseTrailerInviteOpen } from "@/lib/trailer-invite";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

const NO_STORE = { "Cache-Control": "no-store" };

function unavailable(status = 404) {
  return Response.json({ error: "invite_unavailable" }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  if (!trailerInvitesEnabled()) return unavailable();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return unavailable();
  }
  const parsedBody = TrailerInviteOpenBody.safeParse(body);
  if (!parsedBody.success) return unavailable();

  try {
    const result = await createPublicSupabaseClient().rpc("trailer_invite_open", {
      p_token: parsedBody.data.token,
      p_email: parsedBody.data.email,
    });
    if (result.error) {
      const code = inviteErrorCode(result.error);
      return code === "unknown"
        ? Response.json({ error: code }, { status: 500, headers: NO_STORE })
        : unavailable();
    }
    const invite = parseTrailerInviteOpen(result.data);
    return invite ? Response.json(invite, { headers: NO_STORE }) : unavailable();
  } catch (error) {
    const code = inviteErrorCode(error);
    return code === "unknown"
      ? Response.json({ error: code }, { status: 500, headers: NO_STORE })
      : unavailable();
  }
}
