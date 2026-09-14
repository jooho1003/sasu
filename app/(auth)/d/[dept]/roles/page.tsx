import AgentRoles from "@/components/agent-roles";
import { requireMembership } from "@/lib/supabase/membership";

export default async function AgentRolesPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const membership = await requireMembership(dept);

  return <AgentRoles deptId={membership.deptId} role={membership.role} />;
}
