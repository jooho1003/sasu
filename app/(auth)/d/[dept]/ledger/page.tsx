import LedgerS3 from "@/components/ledger-s3";
import { requireMembership } from "@/lib/supabase/membership";

export default async function LedgerPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const membership = await requireMembership(dept);

  return <LedgerS3 deptId={membership.deptId} />;
}
