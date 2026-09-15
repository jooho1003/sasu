import { AcceptInviteBody } from "@/lib/contracts";
import { orgAdminWritesEnabled } from "@/lib/features";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { featureNotFound, requestBody, rpcErrorResponse } from "@/app/api/admin/_shared";

export async function POST(request: Request) {
  if (!orgAdminWritesEnabled()) return featureNotFound();
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: "not_authenticated", message: "로그인이 필요합니다." }, { status: 401 });
  const parsed = AcceptInviteBody.safeParse(await requestBody(request));
  if (!parsed.success) return rpcErrorResponse({ code: "22023", message: "invalid_display_name" });
  const result = await supabase.rpc("accept_invite", { p_token: parsed.data.token, p_display_name: parsed.data.displayName });
  if (result.error) return rpcErrorResponse(result.error);
  const deptId = result.data as string;
  return Response.json({ deptId, next: `/consent?next=${encodeURIComponent(`/d/${deptId}`)}` });
}
