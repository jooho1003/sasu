import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

type Decision = {
  id: string;
  decided_by_name: string;
  decided_at: string | null;
  outcome: string;
  rationale: string;
};
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

export default async function DemoLedgerPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const supabase = createPublicSupabaseClient();
  const { data: decisions, error } = await supabase
    .from("decisions")
    .select("id, decided_by_name, decided_at, outcome, rationale")
    .eq("dept_id", dept)
    .order("decided_at", { ascending: false });
  if (error) throw new Error("게스트 원장 조회 실패");
  const rows = (decisions ?? []) as Decision[];
  return (
    <main className="workspace-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">팀이 함께 쌓아온 판단</p>
          <h1>결정 원장</h1>
          <p>무엇을 결정했는지, 왜 그렇게 정했는지. 그 맥락을 함께 남깁니다.</p>
        </div>
        <Link
          className="button button-secondary button-small"
          href={`/demo/d/${dept}/ask`}
        >
          <Icon name="chat" size={15} />
          결정의 맥락 물어보기
        </Link>
      </header>
      <div className="section-heading">
        <h2>
          기록된 결정 <span>{rows.length}건</span>
        </h2>
        <span className="text-xs text-muted">최근 결정부터</span>
      </div>
      {rows.length === 0 ? (
        <p className="empty-state">아직 기록된 결정이 없습니다.</p>
      ) : (
        <div className="ledger-timeline">
          {rows.map((decision) => (
            <article
              key={decision.id}
              id={`decision-${decision.id}`}
              className="ledger-entry"
            >
              <header>
                <span className="badge badge-green">
                  <Icon name="check" size={12} />
                  결정 완료
                </span>
                <span>{decision.decided_by_name}</span>
                <time dateTime={decision.decided_at ?? undefined}>
                  {decision.decided_at
                    ? dateFormatter.format(new Date(decision.decided_at))
                    : "시각 미상"}
                </time>
              </header>
              <h2>{decision.outcome}</h2>
              <p>{decision.rationale}</p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
