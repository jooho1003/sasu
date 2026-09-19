import { after } from "next/server";
import { SubmitTrailerInviteBody } from "@/lib/contracts";
import { trailerInvitesEnabled } from "@/lib/features";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { validateAttemptSubmissions } from "@/lib/trailer-assessment";
import { inviteErrorCode, parseTrailerInviteOpen } from "@/lib/trailer-invite";
import { runWorkerOnce } from "@/lib/worker";

const headers = { "Cache-Control": "no-store" };
const failure = (error: string, status: number) => Response.json({ error }, { status, headers });
const MAX_BYTES = 64 * 1024;

export async function POST(request: Request) {
  if (!trailerInvitesEnabled()) return failure("invite_unavailable", 404);
  if (Number(request.headers.get("content-length")) > MAX_BYTES) return failure("payload_too_large", 413);
  let body: unknown;
  try {
    // Read a bounded stream: Content-Length is optional and untrusted.
    const reader = request.body?.getReader();
    if (!reader) return failure("invalid_attempt", 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_BYTES) { await reader.cancel(); return failure("payload_too_large", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return failure("invalid_attempt", 400); }
  const parsed = SubmitTrailerInviteBody.safeParse(body);
  if (!parsed.success) return failure("invalid_attempt", 400);
  try {
    const client = createPublicSupabaseClient();
    const opened = await client.rpc("trailer_invite_open", { p_token: parsed.data.token, p_email: parsed.data.email });
    const invite = opened.error ? null : parseTrailerInviteOpen(opened.data);
    if (!invite) return failure("invite_unavailable", 404);
    if (invite.consent_version !== parsed.data.consent_version) return failure("consent_required", 409);
    let submissions;
    try { submissions = validateAttemptSubmissions(invite.scenarios, parsed.data.submissions); }
    catch { return failure("invalid_attempt", 400); }
    const result = await client.rpc("submit_trailer_invite_attempt", { p_token: parsed.data.token, p_email: parsed.data.email, p_submissions: submissions });
    if (result.error) {
      const code = inviteErrorCode(result.error);
      return failure(code, code === "unknown" ? 500 : code === "invite_unavailable" ? 404 : code === "invalid_attempt" ? 400 : 409);
    }
    if (!Array.isArray(result.data) || typeof result.data[0]?.attempt_id !== "string") return failure("invite_unavailable", 404);
    after(async () => { await runWorkerOnce(); });
    return Response.json({ state: "submitted" }, { status: 202, headers });
  } catch { return failure("unknown", 500); }
}
