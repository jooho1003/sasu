import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminOverview, DemoAdminMemberRow, AdminSourceRow, AdminAnswerStatRow } from "@/lib/contracts";
import { orgAdminReadEnabled } from "@/lib/features";
import { answerStatsRange } from "@/lib/org-admin";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { AdminOverviewView, AdminMembersTable, AdminSourcesTable, AdminAnswerStatsTable } from "@/components/admin/views";

export const revalidate = 60;

export default async function DemoAdminPage() {
  if (!orgAdminReadEnabled()) notFound();
  const supabase = createPublicSupabaseClient();
  const range = answerStatsRange({ today: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) });
  if ("error" in range) return null;
  const results = await Promise.all([
    supabase.rpc("demo_admin_overview"), supabase.rpc("demo_admin_members"), supabase.rpc("demo_admin_sources"),
    supabase.rpc("demo_admin_answer_stats", { p_from: range.from, p_to: range.to }),
  ]);
  const overview = AdminOverview.safeParse(results[0].data);
  const members = DemoAdminMemberRow.array().safeParse(results[1].data);
  const sources = AdminSourceRow.array().safeParse(results[2].data);
  const stats = AdminAnswerStatRow.array().safeParse(results[3].data);
  const ready = results.every((result) => !result.error) && overview.success && members.success && sources.success && stats.success;
  return <main className="mx-auto grid min-h-screen max-w-7xl gap-7 px-4 py-10 sm:px-8">
    <header className="grid gap-4"><Link href="/demo">← 부서 선택으로</Link><p className="m-0 text-sm font-bold text-accent">게스트 모드 · 읽기 전용</p><h1 className="m-0 text-3xl">{overview.success ? overview.data.org_name : "조직 관리"}</h1><p className="m-0 text-muted">조직 관리자 권한만으로는 부서 내용을 볼 수 없습니다</p></header>
    {ready ? <>
      <AdminOverviewView data={overview.data} readOnly />
      <section className="grid min-w-0 gap-4"><h2 className="m-0 text-xl">멤버</h2><AdminMembersTable rows={members.data} readOnly /></section>
      <section className="grid min-w-0 gap-4"><h2 className="m-0 text-xl">수집 채널</h2><AdminSourcesTable rows={sources.data} readOnly /></section>
      <section className="grid min-w-0 gap-4"><h2 className="m-0 text-xl">최근 14일 답변 집계</h2><AdminAnswerStatsTable rows={stats.data} readOnly /></section>
    </> : <section className="rounded-2xl bg-surface p-6"><h2 className="m-0 text-2xl">데모를 준비하는 중입니다</h2><p className="mb-0 text-muted">잠시 후 다시 접속해 주세요.</p></section>}
  </main>;
}
