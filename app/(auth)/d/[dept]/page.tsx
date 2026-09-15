import DashboardS1 from "@/components/dashboard-s1";
import { requireMembership } from "@/lib/supabase/membership";
import { trailerPublishEnabled } from "@/lib/features";

type DepartmentDashboardPageProps = {
  params: Promise<{ dept: string }>;
};

export default async function DepartmentDashboardPage({
  params,
}: DepartmentDashboardPageProps) {
  const { dept } = await params;
  const membership = await requireMembership(dept);

  return (
    <DashboardS1
      deptId={membership.deptId}
      displayName={membership.displayName}
      role={membership.role}
      trailerPublishingEnabled={trailerPublishEnabled()}
    />
  );
}
