import { EvidenceDetail } from "@/components/evidence-detail";
import { requirePageMembership } from "@/lib/supabase/membership";

export default async function EvidencePage({ params, searchParams }: { params: Promise<{ dept: string; id: string }>; searchParams: Promise<{ answer?: string | string[] }> }) {
  const { dept, id } = await params;
  const { answer } = await searchParams;
  const answerId = typeof answer === "string" ? answer : undefined;
  const membership = await requirePageMembership(dept, `/d/${dept}/evidence/${id}${answerId ? `?answer=${encodeURIComponent(answerId)}` : ""}`);
  return <EvidenceDetail deptId={membership.deptId} id={id} answerId={answerId} />;
}
