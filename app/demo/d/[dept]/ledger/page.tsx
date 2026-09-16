import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { DemoLedgerSimulator } from "@/components/demo-safe-actions";

type Decision = {
  id: string;
  decided_by_name: string;
  decided_at: string | null;
  outcome: string;
  rationale: string;
};
type Citation = { owner_id: string; item_id: string | null; quote: string };
type Item = { id: string; author: string | null };
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

export default async function DemoLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ dept: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { dept } = await params;
  const { from } = await searchParams;
  const supabase = createPublicSupabaseClient();
  const { data: decisions, error } = await supabase
    .from("decisions")
    .select("id, decided_by_name, decided_at, outcome, rationale")
    .eq("dept_id", dept)
    .order("decided_at", { ascending: false });
  if (error) throw new Error("게스트 원장 조회 실패");
  const rows = (decisions ?? []) as Decision[];
  const { data: citations, error: citationsError } = rows.length
    ? await supabase
        .from("citations")
        .select("owner_id, item_id, quote")
        .eq("owner_kind", "decision")
        .in("owner_id", rows.map((decision) => decision.id))
    : { data: [] as Citation[], error: null };
  if (citationsError) throw new Error("게스트 원장 근거 조회 실패");
  const citationRows = (citations ?? []) as Citation[];
  const itemIds = citationRows.flatMap((citation) => citation.item_id ? [citation.item_id] : []);
  const { data: items, error: itemsError } = itemIds.length
    ? await supabase.from("items").select("id, author").in("id", itemIds)
    : { data: [] as Item[], error: null };
  if (itemsError) throw new Error("게스트 원장 원문 조회 실패");
  const itemMap = new Map(((items ?? []) as Item[]).map((item) => [item.id, item]));
  const citationMap = new Map<string, Citation[]>();
  for (const citation of citationRows) {
    citationMap.set(citation.owner_id, [
      ...(citationMap.get(citation.owner_id) ?? []),
      citation,
    ]);
  }
  const returnCardId = from && /^[0-9a-f-]{36}$/iu.test(from) ? from : null;
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
      {returnCardId ? (
        <Link className="ledger-return-link" href={`/demo/d/${dept}/cards/${returnCardId}`}>
          ← 보던 결정 카드로 돌아가기
        </Link>
      ) : null}
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
              {(citationMap.get(decision.id) ?? []).map((citation, index) => (
                <blockquote className="ledger-citation" key={`${decision.id}-${index}`}>
                  <span>{citation.item_id ? (itemMap.get(citation.item_id)?.author ?? "기록") : "기록"}</span>
                  <q>{citation.quote}</q>
                </blockquote>
              ))}
            </article>
          ))}
        </div>
      )}
      <DemoLedgerSimulator />
      <section className="card-next-step">
        <div><strong>다음 4/4 · 같은 질문 비교</strong><span>부서가 바뀌면 같은 질문에 어떤 답이 달라지는지 확인하세요.</span></div>
        <Link className="button button-primary button-small" href={`/demo/d/${dept}/ask?q=principle`}>
          사수에게 묻기 <Icon name="arrow" size={14} />
        </Link>
      </section>
    </main>
  );
}
