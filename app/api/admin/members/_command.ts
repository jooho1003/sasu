import { MemberTargetBody } from "@/lib/contracts";
import { orgAdminWritesEnabled } from "@/lib/features";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { featureNotFound, requestBody, rpcErrorResponse } from "../_shared";

export async function memberCommand(request: Request, rpc: "demote_lead" | "remove_member") {
  if (!orgAdminWritesEnabled()) return featureNotFound();
  const parsed = MemberTargetBody.safeParse(await requestBody(request));
  if (!parsed.success) return rpcErrorResponse({ code: "22023", message: "not_member" });
  const result = await (await createServerSupabaseClient()).rpc(rpc, {
    p_user: parsed.data.userId,
    p_dept: parsed.data.deptId,
  });
  if (result.error) return rpcErrorResponse(result.error);
  return Response.json({ ok: true });
}
