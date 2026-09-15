import { CreateDepartmentBody } from "@/lib/contracts";
import { orgAdminWritesEnabled } from "@/lib/features";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { featureNotFound, requestBody, rpcErrorResponse } from "../_shared";

export async function POST(request: Request) {
  if (!orgAdminWritesEnabled()) return featureNotFound();
  const parsed = CreateDepartmentBody.safeParse(await requestBody(request));
  if (!parsed.success) return rpcErrorResponse({ code: "22023", message: "invalid_department_name" });
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("admin_create_department", { p_name: parsed.data.name });
  if (result.error) return rpcErrorResponse(result.error);
  return Response.json({ deptId: result.data }, { status: 201 });
}
