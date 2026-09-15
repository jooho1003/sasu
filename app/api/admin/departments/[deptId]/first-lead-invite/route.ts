import { InviteEmailBody } from "@/lib/contracts";
import { orgAdminWritesEnabled } from "@/lib/features";
import { normalizeEmail } from "@/lib/org-admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createdInviteResponse, featureNotFound, requestBody, rpcErrorResponse } from "../../../_shared";

export async function POST(request: Request, { params }: { params: Promise<{ deptId: string }> }) {
  if (!orgAdminWritesEnabled()) return featureNotFound();
  const raw = await requestBody(request);
  const parsed = InviteEmailBody.safeParse(raw);
  const email = parsed.success ? normalizeEmail(parsed.data.email) : null;
  if (!email) return rpcErrorResponse({ code: "22023", message: "invalid_email" });
  const { deptId } = await params;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("admin_invite_first_lead", { p_dept: deptId, p_email: email });
  if (result.error) return rpcErrorResponse(result.error);
  return createdInviteResponse(result.data, new URL(request.url).origin);
}
