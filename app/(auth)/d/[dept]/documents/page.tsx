import DocumentAssistant from "@/components/document-assistant";
import { requireMembership } from "@/lib/supabase/membership";

export default async function DocumentsPage({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  return <DocumentAssistant deptId={membership.deptId} role={membership.role} />;
}
