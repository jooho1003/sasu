import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { requirePageMembership } from "@/lib/supabase/membership";
import { RetroDetail } from "@/components/retro-detail";
export default async function RetroPage({ params }: { params: Promise<{ dept: string; id: string }> }) {
  if (process.env.SASU_RETRO_ENABLED !== "true") notFound();
  const { dept, id } = await params; if (!z.uuid().safeParse(id).success) notFound();
  const member = await requirePageMembership(dept, `/d/${dept}/retros/${id}`);
  return <main className="workspace-page"><Link className="text-accent" href={`/d/${dept}/retros`}>← 회고 목록</Link><RetroDetail dept={member.deptId} id={id} /></main>;
}
