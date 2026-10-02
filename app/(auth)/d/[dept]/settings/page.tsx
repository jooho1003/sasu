import { RetroCollectorSettings } from "@/components/retro-collector-settings";
import SettingsS5 from "@/components/settings-s5";
import { isDemoReviewer } from "@/lib/demo-access";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { orgAdminWritesEnabled } from "@/lib/features";
import { RetroConnectorsSettings } from "@/components/retro-connectors-settings";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  const client = await createServerSupabaseClient();
  const demo = await client.rpc("is_demo_department", { p_dept: membership.deptId });

  return <><SettingsS5 deptId={membership.deptId} memberAdminEnabled={orgAdminWritesEnabled()} isDemo={demo.data === true || isDemoReviewer(membership.userId)} />{process.env.SASU_RETRO_ENABLED === "true" ? <div className="workspace-page grid gap-5"><RetroCollectorSettings /><RetroConnectorsSettings dept={membership.deptId} role={membership.role} /></div> : null}</>;
}
