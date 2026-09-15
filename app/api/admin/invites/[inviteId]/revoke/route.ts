import { orgAdminWritesEnabled } from "@/lib/features";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { featureNotFound, rpcErrorResponse } from "../../../_shared";

export async function POST(_request: Request, { params }: { params: Promise<{ inviteId: string }> }) {
  if (!orgAdminWritesEnabled()) return featureNotFound();
  const { inviteId } = await params;
  const result = await (await createServerSupabaseClient()).rpc("revoke_invite", { p_invite: inviteId });
  if (result.error) return rpcErrorResponse(result.error);
  return Response.json({ ok: true });
}
