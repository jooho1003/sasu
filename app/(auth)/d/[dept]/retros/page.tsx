import { notFound } from "next/navigation";
import { requirePageMembership } from "@/lib/supabase/membership";
import { RetroTimeline } from "@/components/retro-timeline";
export default async function RetrosPage({ params }: { params: Promise<{ dept: string }> }) {
  if (process.env.SASU_RETRO_ENABLED !== "true") notFound();
  const { dept } = await params; const member = await requirePageMembership(dept, `/d/${dept}/retros`);
  return <main className="workspace-page"><h1>개발 회고</h1><RetroTimeline dept={member.deptId} userId={member.userId} /></main>;
}
