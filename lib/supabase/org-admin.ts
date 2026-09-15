import { notFound, redirect } from "next/navigation";

import { orgAdminReadEnabled } from "@/lib/features";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function requireOrgAdmin(): Promise<
  { status: "ok"; userId: string; orgId: string } | { status: "forbidden" }
> {
  if (!orgAdminReadEnabled()) notFound();
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?next=/admin");
  const result = await supabase.rpc("admin_org_id");
  if (result.error || !result.data) return { status: "forbidden" };
  return { status: "ok", userId: user.id, orgId: result.data as string };
}
