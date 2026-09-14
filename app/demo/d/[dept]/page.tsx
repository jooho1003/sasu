import Link from "next/link";
import { notFound } from "next/navigation";

import { createPublicSupabaseClient } from "@/lib/supabase/public";

type Source = { id: string; kind: "slack_channel" | "meeting" | "notion_page" | "document"; title: string | null };
type Item = { id: string; source_id: string; author: string | null; spoken_at: string | null; content: string };
type Classification = { item_id: string; label: "decision" | "action" | "info" | "chatter" | "unclassified" };
type Card = { id: string; title: string; status: string; visibility: string };

const LABELS: Record<Classification["label"], string> = {
  decision: "결정 필요",
  action: "액션",
  info: "정보",
  chatter: "잡담",
  unclassified: "분류 대기",
};

export default async function DemoDashboardPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const supabase = createPublicSupabaseClient();
  const { data: department } = await supabase.from("departments").select("id, name").eq("id", dept).maybeSingle<{ id: string; name: string }>();
  if (!department) notFound();

  const [sourcesResult, itemsResult, cardsResult] = await Promise.all([
    supabase.from("sources").select("id, kind, title").eq("dept_id", dept).eq("active", true),
    supabase.from("items").select("id, source_id, author, spoken_at, content").eq("dept_id", dept).is("deleted_at", null).order("spoken_at", { ascending: false }),
    supabase.from("decision_requests").select("id, title, status, visibility").eq("dept_id", dept).order("opened_at", { ascending: false }),
  ]);
  if (sourcesResult.error || itemsResult.error || cardsResult.error) {
    throw new Error("데모 대시보드 조회 실패");
  }

  const sources = (sourcesResult.data ?? []) as Source[];
  const items = (itemsResult.data ?? []) as Item[];
  const cards = (cardsResult.data ?? []) as Card[];
  const itemIds = items.map((item) => item.id);
  const { data: classifications } = itemIds.length === 0
    ? { data: [] as Classification[] }
    : await supabase.from("classifications").select("item_id, label").in("item_id", itemIds);
  const classificationMap = new Map(((classifications ?? []) as Classification[]).map((row) => [row.item_id, row.label]));
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const grouped = new Map<string, Item[]>();
  for (const item of items) {
    const label = classificationMap.get(item.id) ?? "unclassified";
    grouped.set(label, [...(grouped.get(label) ?? []), item]);
  }
  const sourceCounts = {
    slack_channel: items.filter((item) => sourceMap.get(item.source_id)?.kind === "slack_channel").length,
    meeting: items.filter((item) => sourceMap.get(item.source_id)?.kind === "meeting").length,
    notion_page: items.filter((item) => {
      const kind = sourceMap.get(item.source_id)?.kind;
      return kind === "notion_page" || kind === "document";
    }).length,
  };

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 sm:px-8">
      <section className="grid gap-3">
        <p className="m-0 text-sm font-bold text-[var(--accent)]">S1 · 부서 대시보드</p>
        <h1 className="m-0 text-4xl">오늘의 입력이 결정으로 정리됩니다</h1>
        <p className="m-0 text-[var(--muted)]">{department.name}의 합성 데이터 · 로그인 없이 읽기 전용</p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="입력 카운트">
        {[["슬랙", sourceCounts.slack_channel], ["회의", sourceCounts.meeting], ["문서", sourceCounts.notion_page]].map(([label, count]) => (
          <div key={label} className="rounded-2xl bg-[var(--surface)] p-5 shadow-sm">
            <p className="m-0 text-sm text-[var(--muted)]">{label}</p>
            <strong className="text-3xl">{count}</strong>
          </div>
        ))}
      </section>

      <section className="grid gap-4" aria-labelledby="demo-items-heading">
        <div><p className="m-0 text-sm text-[var(--muted)]">WATCH</p><h2 id="demo-items-heading" className="m-0 text-2xl">분류된 기록</h2></div>
        {grouped.size === 0 ? (
          <p className="m-0 rounded-2xl border border-dashed border-black/20 p-6 text-[var(--muted)]">아직 분류된 기록이 없습니다.</p>
        ) : Array.from(grouped.entries()).map(([label, group]) => (
          <div key={label} className="grid gap-3">
            <h3 className="m-0 text-lg">{LABELS[label as Classification["label"]] ?? label} <span className="text-sm text-[var(--muted)]">{group.length}건</span></h3>
            {group.map((item) => {
              const source = sourceMap.get(item.source_id);
              return <article key={item.id} className="rounded-2xl bg-[var(--surface)] p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]"><span>{source?.title ?? "입력"}</span><span>{item.author ?? "작성자 미상"}</span></div><p className="mb-0 mt-3 leading-7">{item.content}</p></article>;
            })}
          </div>
        ))}
      </section>

      <section className="grid gap-4" aria-labelledby="demo-cards-heading">
        <div><p className="m-0 text-sm text-[var(--muted)]">DECIDE</p><h2 id="demo-cards-heading" className="m-0 text-2xl">결정 카드</h2></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.length === 0 ? (
            <p className="m-0 rounded-2xl border border-dashed border-black/20 p-6 text-[var(--muted)] sm:col-span-2">지금 결정할 카드가 없습니다.</p>
          ) : cards.map((card) => <Link key={card.id} className="grid gap-2 rounded-2xl border-l-4 border-l-[var(--urgent)] bg-[var(--surface)] p-5 shadow-sm" href={`/demo/d/${dept}/cards/${card.id}`}><span className="text-xs text-[var(--muted)]">{card.visibility === "leads_only" ? "팀장 근거 포함" : "부서 전체"} · {card.status === "open" ? "결정 필요" : card.status}</span><strong className="text-lg">{card.title}</strong><span className="text-sm text-[var(--accent)]">카드 상세 보기 →</span></Link>)}
        </div>
      </section>
    </main>
  );
}
