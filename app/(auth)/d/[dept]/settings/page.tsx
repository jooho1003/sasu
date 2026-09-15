import SettingsS5 from "@/components/settings-s5";
import { requireMembership } from "@/lib/supabase/membership";
import { orgAdminWritesEnabled } from "@/lib/features";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const membership = await requireMembership(dept);

  return <SettingsS5 deptId={membership.deptId} memberAdminEnabled={orgAdminWritesEnabled()} />;
}
