import { orgAdminWritesEnabled } from "@/lib/features";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { featureNotFound, rpcErrorResponse } from "@/app/api/admin/_shared";

type MemberRpc = "lead_promote_member" | "demote_lead" | "remove_member";

export async function leadMemberCommand(
  rpc: MemberRpc,
  { params }: { params: Promise<{ dept: string; userId: string }> },
) {
  if (!orgAdminWritesEnabled()) return featureNotFound();
  const { dept, userId } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") return rpcErrorResponse({ code: "42501", message: "forbidden" });
  const result = await (await createServerSupabaseClient()).rpc(rpc, { p_user: userId, p_dept: membership.deptId });
  if (result.error) return rpcErrorResponse(result.error);
  return Response.json({ ok: true });
}
