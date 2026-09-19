import DashboardS1 from "@/components/dashboard-s1";
import { requireMembership } from "@/lib/supabase/membership";
import { trailerPublishEnabled } from "@/lib/features";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

type DepartmentDashboardPageProps = {
  params: Promise<{ dept: string }>;
  searchParams: Promise<{ item?: string | string[] }>;
};

export default async function DepartmentDashboardPage({
  params,
  searchParams,
}: DepartmentDashboardPageProps) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  const { item: itemId } = await searchParams;
  if (itemId !== undefined) {
    if (!z.uuid().safeParse(itemId).success) notFound();
    const supabase = await createServerSupabaseClient();
    const { data: item, error } = await supabase.from("items")
      .select("id,content,author,spoken_at,sources(title)")
      .eq("dept_id", membership.deptId).eq("id", itemId as string)
      .is("deleted_at", null).maybeSingle();
    if (error) throw new Error("원문을 불러오지 못했습니다. 잠시 후 다시 시도하세요.");
    if (!item) notFound();
    const source = Array.isArray(item.sources) ? item.sources[0] : item.sources;
    return <main className="workspace-page">
      <Link href={`/d/${membership.deptId}`}>부서 대시보드로 돌아가기</Link>
      <article id={`item-${item.id}`} className="panel grid gap-4 p-6">
        <h1 className="m-0 text-2xl">{source?.title ?? "부서 기록"}</h1>
        <p className="m-0 text-sm text-[var(--muted)]">원문 · {item.author ?? "작성자 미상"}{item.spoken_at ? ` · ${new Date(item.spoken_at).toLocaleString("ko-KR", {timeZone:"Asia/Seoul"})}` : ""}</p>
        <p className="m-0 whitespace-pre-wrap leading-7">{item.content}</p>
      </article>
    </main>;
  }

  return (
    <DashboardS1
      deptId={membership.deptId}
      displayName={membership.displayName}
      role={membership.role}
      trailerPublishingEnabled={trailerPublishEnabled()}
    />
  );
}
