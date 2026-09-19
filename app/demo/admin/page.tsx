import { AdminShell } from "@/components/admin/shell";
import {
  AdminOverview,
  DemoAdminMemberRow,
  AdminSourceRow,
  AdminAnswerStatRow,
} from "@/lib/contracts";
import { answerStatsRange } from "@/lib/org-admin";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import {
  AdminOverviewView,
  AdminMembersTable,
  AdminSourcesTable,
  AdminAnswerStatsTable,
} from "@/components/admin/views";

export const dynamic = "force-dynamic";

export default async function DemoAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const section = ["members", "sources", "audit"].includes(view ?? "")
    ? view!
    : "overview";
  const supabase = createPublicSupabaseClient();
  const range = answerStatsRange({
    today: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
  });
  if ("error" in range) return null;
  const results = await Promise.all([
    supabase.rpc("demo_admin_overview"),
    supabase.rpc("demo_admin_members"),
    supabase.rpc("demo_admin_sources"),
    supabase.rpc("demo_admin_answer_stats", {
      p_from: range.from,
      p_to: range.to,
    }),
  ]);
  const overview = AdminOverview.safeParse(results[0].data);
  const members = DemoAdminMemberRow.array().safeParse(results[1].data);
  const sources = AdminSourceRow.array().safeParse(results[2].data);
  const stats = AdminAnswerStatRow.array().safeParse(results[3].data);
  const ready =
    results.every((result) => !result.error) &&
    overview.success &&
    members.success &&
    sources.success &&
    stats.success;
  const titles: Record<string, [string, string]> = {
    overview: [
      "조직 한눈에",
      "부서별 멤버, 연결된 자료와 의사결정 현황을 한눈에 확인하세요.",
    ],
    members: ["멤버", "부서별 역할, 수집 동의와 슬랙 연결 상태를 확인하세요."],
    sources: [
      "연결한 채널",
      "조직에 연결된 자료의 볼 수 있는 사람와 새로 가져오기 상태를 확인하세요.",
    ],
    audit: [
      "기록",
      "최근 14일의 부서별 답변 집계입니다. 질문과 답변의 본문은 표시하지 않습니다.",
    ],
  };
  return (
    <AdminShell
      orgName={overview.success ? overview.data.org_name : "조직 관리"}
      demoSection={section}
    >
      <header className="page-heading">
        <div>
          <p className="eyebrow">조직 관리</p>
          <h1>{titles[section][0]}</h1>
          <p>{titles[section][1]}</p>
        </div>
      </header>
      {ready ? (
        <>
          {section === "overview" ? (
            <AdminOverviewView data={overview.data} readOnly />
          ) : null}
          {section === "members" ? (
            <AdminMembersTable rows={members.data} readOnly />
          ) : null}
          {section === "sources" ? (
            <AdminSourcesTable rows={sources.data} readOnly />
          ) : null}
          {section === "audit" ? (
            <section className="grid min-w-0 gap-4">
              <h2 className="m-0 text-xl">최근 14일 답변 집계</h2>
              <AdminAnswerStatsTable rows={stats.data} readOnly />
            </section>
          ) : null}
        </>
      ) : (
        <section className="panel empty-state">
          <h2>데모를 준비하는 중입니다</h2>
          <p>잠시 후 다시 접속해 주세요.</p>
        </section>
      )}
    </AdminShell>
  );
}
