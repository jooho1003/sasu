import { deriveRecordingKey, recordingSecretForVersion } from "@/lib/recording/recording-key";
import { ReviewRecordingStart } from "@/lib/contracts";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const NO_STORE = { "cache-control": "private, no-store, max-age=0" };

function denied(status: number, error: string) {
  return Response.json({ error }, { status, headers: NO_STORE });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ dept: string; id: string }> },
) {
  const { dept, id } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead" || !membership.consentedAt) {
    return denied(403, "recording_key_forbidden");
  }
  if (!ReviewRecordingStart.shape.id.safeParse(id).success) return denied(400, "recording_id_invalid");

  const client = await createServerSupabaseClient();
  const result = await client.rpc("recording_key_context", {
    p_dept: membership.deptId,
    p_review: id,
  });
  if (result.error) {
    const message = result.error.message;
    if (result.error.code === "P0002" || message === "recording_unavailable") {
      return denied(404, "recording_unavailable");
    }
    return denied(403, "recording_key_forbidden");
  }

  const context = result.data as Record<string, unknown> | null;
  if (
    context?.recording_id !== id ||
    context.user_id !== membership.userId ||
    context.dept_id !== membership.deptId
  ) {
    return denied(403, "recording_key_forbidden");
  }

  try {
    const secret = recordingSecretForVersion(process.env, context.key_version);
    const key = await deriveRecordingKey(secret, {
      recordingId: id,
      userId: membership.userId,
      deptId: membership.deptId,
      keyVersion: context.key_version as number,
    });
    return Response.json(
      { key: Buffer.from(key).toString("base64url") },
      { headers: NO_STORE },
    );
  } catch {
    return denied(503, "recording_key_unavailable");
  }
}
