import { SubmitTrailerInviteBody } from "@/lib/contracts";
import { trailerInvitesEnabled } from "@/lib/features";
import { inviteErrorCode, parseTrailerInviteOpen } from "@/lib/trailer-invite";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

const NO_STORE = { "Cache-Control": "no-store" };
const ConsentBody = SubmitTrailerInviteBody.omit({ submissions: true });

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
  const parsedBody = ConsentBody.safeParse(body);
  if (!parsedBody.success) return unavailable();

  try {
    const result = await createPublicSupabaseClient().rpc("trailer_invite_consent", {
      p_token: parsedBody.data.token,
      p_email: parsedBody.data.email,
      p_version: parsedBody.data.consent_version,
    });
    if (result.error) {
      const code = inviteErrorCode(result.error);
      return code === "unknown"
        ? Response.json({ error: code }, { status: 500, headers: NO_STORE })
        : unavailable();
    }
    // The void RPC preserves failed-email counters without throwing. Verify the
    // postcondition before moving the browser beyond the consent screen.
    const opened = await createPublicSupabaseClient().rpc("trailer_invite_open", { p_token: parsedBody.data.token, p_email: parsedBody.data.email });
    const invite = opened.error ? null : parseTrailerInviteOpen(opened.data);
    if (!invite || !["ready", "submitted"].includes(invite.state)) return unavailable();
    return Response.json({ state: "ready" }, { headers: NO_STORE });
  } catch (error) {
    const code = inviteErrorCode(error);
    return code === "unknown"
      ? Response.json({ error: code }, { status: 500, headers: NO_STORE })
      : unavailable();
  }
}
