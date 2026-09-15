import { orgAdminWritesEnabled } from "@/lib/features";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { featureNotFound, rpcErrorResponse } from "@/app/api/admin/_shared";

export async function POST(_request: Request, { params }: { params: Promise<{ dept: string; inviteId: string }> }) {
  if (!orgAdminWritesEnabled()) return featureNotFound();
  const { dept, inviteId } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") return rpcErrorResponse({ code: "42501", message: "forbidden" });
  const result = await (await createServerSupabaseClient()).rpc("revoke_invite", { p_invite: inviteId });
  if (result.error) return rpcErrorResponse(result.error);
  return Response.json({ ok: true });
}
