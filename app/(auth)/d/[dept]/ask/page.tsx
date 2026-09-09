import AskS4 from "@/components/ask-s4";
import { requireMembership } from "@/lib/supabase/membership";

export default async function AskPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  return <AskS4 deptId={membership.deptId} />;
}
