import { registerHandler } from "@/lib/jobs";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export async function purgeTrailerInvites(): Promise<number> {
  const { data, error } = await createServiceSupabaseClient().rpc("purge_expired_trailer_invites");
  if (error || !Number.isSafeInteger(data) || data < 0) {
    throw Object.assign(new Error("job_failed"), { error_code: "job_failed" });
  }
  return data;
}

export function registerTrailerPurgeHandler(): void {
  registerHandler("purge_trailer_invites", async () => {
    const count = await purgeTrailerInvites();
    console.info("trailer_invites_purged", { count });
  });
}
