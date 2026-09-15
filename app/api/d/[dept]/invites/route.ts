import { InviteEmailBody, LeadInviteRow } from "@/lib/contracts";
import { orgAdminReadEnabled, orgAdminWritesEnabled } from "@/lib/features";
import { normalizeEmail } from "@/lib/org-admin";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createdInviteResponse, featureNotFound, requestBody, rpcErrorResponse } from "@/app/api/admin/_shared";

type Context = { params: Promise<{ dept: string }> };

export async function GET(_request: Request, { params }: Context) {
  if (!orgAdminReadEnabled()) return featureNotFound();
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") return rpcErrorResponse({ code: "42501", message: "forbidden" });
  const result = await (await createServerSupabaseClient()).rpc("lead_invites", { p_dept: membership.deptId });
  if (result.error) return rpcErrorResponse(result.error);
  const parsed = LeadInviteRow.array().safeParse(result.data ?? []);
  if (!parsed.success) return rpcErrorResponse({ code: "XX000" });
  return Response.json({ invites: parsed.data });
}

export async function POST(request: Request, { params }: Context) {
  if (!orgAdminWritesEnabled()) return featureNotFound();
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") return rpcErrorResponse({ code: "42501", message: "forbidden" });
  const parsed = InviteEmailBody.safeParse(await requestBody(request));
  const email = parsed.success ? normalizeEmail(parsed.data.email) : null;
  if (!email) return rpcErrorResponse({ code: "22023", message: "invalid_email" });
  const result = await (await createServerSupabaseClient()).rpc("lead_invite_member", { p_dept: membership.deptId, p_email: email });
  if (result.error) return rpcErrorResponse(result.error);
  return createdInviteResponse(result.data, new URL(request.url).origin);
}
