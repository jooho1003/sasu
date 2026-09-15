import { AdminAnswerStatRow, AdminEventRow } from "@/lib/contracts";
import { answerStatsRange, adminErrorMessage } from "@/lib/org-admin";
import { AdminAnswerStatsTable, AdminEventsTable, AdminUnavailable, adminPanel } from "@/components/admin/views";
import { AdminTabs } from "@/components/admin/actions";
import { adminRead, adminContext } from "../_data";

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await adminContext();
  const input = await searchParams;
  const range = answerStatsRange({ ...input, today: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) });
  const [stats, events] = await Promise.all([
    "error" in range ? Promise.resolve(null) : adminRead("admin_answer_stats", AdminAnswerStatRow.array(), { p_from: range.from, p_to: range.to }),
    adminRead("admin_events_list", AdminEventRow.array(), { p_limit: 100 }),
  ]);
  return <><h1 className="m-0 text-3xl">기록</h1><div className="grid gap-3 md:grid-cols-3">{[
    ["보이는 것", "일별·부서별 답변·거절·실패 수, 인용 가시성별 합계"],
    ["보이지 않는 것", "질문 원문, 질문자, 답변 한 건의 시각과 인용"],
    ["준비 중", "권한 경계 판정"],
  ].map(([title, description]) => <section key={title} className={adminPanel}><h2 className="m-0 text-base">{title}</h2><p className="mb-0 text-sm text-muted">{description}</p></section>)}</div>
    <AdminTabs tabs={[
      { label: "답변 집계", content: <div className="grid gap-4"><form className="flex flex-wrap items-end gap-3">{[["from", "시작일"], ["to", "종료일"]].map(([name, label]) => <label key={name} className="grid gap-2 text-sm">{label}<input type="date" name={name} defaultValue={"error" in range ? input[name as "from" | "to"] : range[name as "from" | "to"]} required className="rounded-xl border border-ink/20 bg-surface px-3 py-2" /></label>)}<button className="rounded-xl border border-accent/30 px-4 py-2 text-sm font-bold text-accent">조회</button><span className="text-sm text-muted">최대 31일</span></form>{"error" in range ? <AdminUnavailable>{adminErrorMessage(range.error)}</AdminUnavailable> : stats ? <AdminAnswerStatsTable rows={stats} /> : <AdminUnavailable />}</div> },
      { label: "관리 기록", content: events ? <AdminEventsTable rows={events} /> : <AdminUnavailable /> },
    ]} />
  </>;
}
