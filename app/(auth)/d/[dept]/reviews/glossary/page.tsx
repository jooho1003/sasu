import { GlossaryEditor } from "@/components/glossary-editor";
import { requirePageMembership } from "@/lib/supabase/membership";

export default async function Page({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  const member = await requirePageMembership(dept, `/d/${dept}/reviews/glossary`);
  return <GlossaryEditor deptId={member.deptId} />;
}
