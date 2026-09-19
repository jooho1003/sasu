import { labelFrom } from "@/lib/labels";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { formatConflictBadge } from "@/lib/conflicts";
import { DemoDecisionSimulator } from "@/components/demo-safe-actions";

type Card = { id: string; title: string; background: string; recommendation: string | null; status: string; visibility: string };
type Citation = { item_id: string | null; decision_id: string | null; quote: string };
type Item = { id: string; author: string | null; content: string; source_id: string };
type Decision = { id: string; outcome: string; rationale: string; decided_by_name: string; decided_at: string | null };
type Conflict = { id: string; prior_decision_id: string; explanation: string };

export default async function DemoCardPage({
  params,
}: {
  params: Promise<{ dept: string; id: string }>;
}) {
  const { dept, id } = await params;
  const supabase = createPublicSupabaseClient();
  const { data: card } = await supabase.from("decision_requests").select("id, title, background, recommendation, status, visibility").eq("id", id).eq("dept_id", dept).maybeSingle<Card>();
  if (!card) notFound();
  const { data: citations } = await supabase.from("citations").select("item_id, decision_id, quote").eq("owner_kind", "decision_request").eq("owner_id", id);
  const rows = (citations ?? []) as Citation[];
  const itemIds = rows.flatMap((row) => row.item_id ? [row.item_id] : []);
  const decisionIds = rows.flatMap((row) => row.decision_id ? [row.decision_id] : []);
  const { data: conflicts } = await supabase.from("conflicts").select("id, prior_decision_id, explanation").eq("request_id", id);
  const conflictRows = (conflicts ?? []) as Conflict[];
  const referencedDecisionIds = [...new Set([...decisionIds, ...conflictRows.map((conflict) => conflict.prior_decision_id)])];
  const [{ data: items }, { data: decisions }] = await Promise.all([
    itemIds.length ? supabase.from("items").select("id, author, content, source_id").in("id", itemIds) : Promise.resolve({ data: [] as Item[] }),
    referencedDecisionIds.length ? supabase.from("decisions").select("id, outcome, rationale, decided_by_name, decided_at").in("id", referencedDecisionIds) : Promise.resolve({ data: [] as Decision[] }),
  ]);
  const itemMap = new Map(((items ?? []) as Item[]).map((item) => [item.id, item]));
  const decisionMap = new Map(((decisions ?? []) as Decision[]).map((decision) => [decision.id, decision]));
  const deadline = card.background.match(/오늘\s+\d{1,2}시까지/u)?.[0] ?? "기록 확인";

  return (
    <main className="workspace-page">
      <Link className="text-sm" href={`/demo/d/${dept}`}>← 대시보드</Link>
      <article className="grid gap-6 panel border-l-4 border-l-[var(--urgent)] p-6 shadow-sm sm:p-8">
        <header className="grid gap-4">
          <span className="w-fit rounded-full bg-[var(--urgent)] px-3 py-1 text-xs font-bold text-white">지금 결정</span>
          <h1 className="m-0 text-3xl">{card.title}</h1>
          <dl className="card-facts" aria-label="결정 카드 핵심 정보">
            <div><dt>마감</dt><dd>{deadline}</dd></div>
            <div><dt>결정하는 사람</dt><dd>{card.visibility === "leads_only" ? "팀장" : "부서 멤버"}</dd></div>
            <div><dt>볼 수 있는 사람</dt><dd>{card.visibility === "leads_only" ? "팀장만" : "부서 전체"}</dd></div>
            <div><dt>근거</dt><dd>{rows.length}개</dd></div>
            <div><dt>상태</dt><dd>{labelFrom("cardStatus", card.status)}</dd></div>
          </dl>
        </header>
        <section className="grid gap-2"><h2 className="m-0 text-xl">무슨 일인가요</h2><p className="m-0 whitespace-pre-wrap leading-7">{card.background}</p></section>
        <section className="grid gap-3"><h2 className="m-0 text-xl">원문 근거</h2>{rows.map((row, index) => { const item = row.item_id ? itemMap.get(row.item_id) : null; const decision = row.decision_id ? decisionMap.get(row.decision_id) : null; return <blockquote key={`${row.quote}-${index}`} className="m-0 grid gap-2 rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent)]/5 p-4"><span className="text-xs text-[var(--muted)]">{item?.author ?? decision?.decided_by_name ?? "기록"}</span><q className="leading-7">{row.quote}</q></blockquote>; })}</section>
        {conflictRows.length > 0 ? <section className="grid gap-2 rounded-2xl border border-[var(--urgent)]/30 bg-[var(--urgent)]/5 p-5"><h2 className="m-0 text-xl text-[var(--urgent)]">예전 결정과 다릅니다</h2>{conflictRows.map((conflict) => <div key={conflict.id} className="grid gap-1"><Link className="w-fit text-sm font-bold text-[var(--urgent)]" href={`/demo/d/${dept}/ledger?from=${encodeURIComponent(card.id)}#decision-${conflict.prior_decision_id}`}>{formatConflictBadge(decisionMap.get(conflict.prior_decision_id)?.decided_at ?? null)}</Link><p className="m-0 leading-7">{conflict.explanation}</p></div>)}</section> : null}
        {card.recommendation ? <section className="grid gap-2"><h2 className="m-0 text-xl">사수의 제안</h2><p className="m-0 whitespace-pre-wrap leading-7">{card.recommendation}</p></section> : null}
        <DemoDecisionSimulator requestId={id} title={card.title} quote={rows.find(row => row.item_id && itemMap.get(row.item_id)?.content.includes(row.quote))?.quote} sourceId={items?.[0]?.source_id} />
        <footer className="card-next-step">
          <div><strong>다음 3/4 · 과거 결정 확인</strong><span>충돌한 결정의 이유와 원문 근거를 결정 기록에서 확인하세요.</span></div>
          <Link className="button button-primary button-small" href={`/demo/d/${dept}/ledger?from=${encodeURIComponent(card.id)}`}>
            결정 기록 보기 <Icon name="arrow" size={14} />
          </Link>
        </footer>
        <div className="text-sm text-[var(--muted)]">눌러 본 결과는 브라우저에서만 보이며 실제 결정 기록이나 외부 채널을 변경하지 않습니다.</div>
      </article>
    </main>
  );
}
