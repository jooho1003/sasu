import Link from "next/link";
import { DemoRecords, type RecordKind } from "@/components/demo-records";
import { Icon } from "@/components/ui/icon";
import { notFound } from "next/navigation";
import { salesDemoRecords } from "@/lib/demo-workspace";
import { DEMO_DEFAULT_DEPT_ID } from "@/lib/demo-access";

import { createPublicSupabaseClient } from "@/lib/supabase/public";

type Source = {
  id: string;
  kind: "slack_channel" | "meeting" | "notion_page" | "document";
  title: string | null;
};
type Item = {
  id: string;
  source_id: string;
  author: string | null;
  spoken_at: string | null;
  content: string;
};
type Classification = {
  item_id: string;
  label: "decision" | "action" | "info" | "chatter" | "unclassified";
};
type Card = { id: string; title: string; status: string; visibility: string };

const recordKind = (kind?: Source["kind"]): RecordKind =>
  kind === "slack_channel" ? "slack" : kind === "meeting" ? "meeting" : "document";

const LABELS: Record<Classification["label"], string> = {
  decision: "결정 필요",
  action: "액션",
  info: "정보",
  chatter: "잡담",
  unclassified: "분류 대기",
};

export default async function DemoDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ dept: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { dept } = await params;
  const { kind } = await searchParams;
  const initialKind = (["slack", "meeting", "document"] as const).find((value) => value === kind);
  const supabase = createPublicSupabaseClient();
  const { data: department } = await supabase
    .from("departments")
    .select("id, name")
    .eq("id", dept)
    .maybeSingle<{ id: string; name: string }>();
  if (!department) notFound();

  const [sourcesResult, itemsResult, cardsResult] = await Promise.all([
    supabase
      .from("sources")
      .select("id, kind, title")
      .eq("dept_id", dept)
      .eq("active", true),
    supabase
      .from("items")
      .select("id, source_id, author, spoken_at, content")
      .eq("dept_id", dept)
      .is("deleted_at", null)
      .order("spoken_at", { ascending: false }),
    supabase
      .from("decision_requests")
      .select("id, title, status, visibility")
      .eq("dept_id", dept)
      .order("opened_at", { ascending: false }),
  ]);
  if (sourcesResult.error || itemsResult.error || cardsResult.error) {
    throw new Error("데모 대시보드 조회 실패");
  }

  const extra = dept === DEMO_DEFAULT_DEPT_ID ? salesDemoRecords : { sources: [], items: [] };
  const sources = [...(sourcesResult.data ?? []), ...extra.sources] as Source[];
  const items = [...(itemsResult.data ?? []), ...extra.items.map(item => ({ ...item, spoken_at: null }))] as Item[];
  const cards = (cardsResult.data ?? []) as Card[];
  const itemIds = (itemsResult.data ?? []).map((item) => item.id);
  const { data: classifications } =
    itemIds.length === 0
      ? { data: [] as Classification[] }
      : await supabase
          .from("classifications")
          .select("item_id, label")
          .in("item_id", itemIds);
  const classificationMap = new Map(
    ((classifications ?? []) as Classification[]).map((row) => [
      row.item_id,
      row.label,
    ]),
  );
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  for (const item of extra.items) classificationMap.set(item.id, item.label as Classification["label"]);
  const grouped = new Map<string, Item[]>();
  for (const item of items) {
    const label = classificationMap.get(item.id) ?? "unclassified";
    grouped.set(label, [...(grouped.get(label) ?? []), item]);
  }
  const sourceCounts = {
    slack_channel: items.filter(
      (item) => sourceMap.get(item.source_id)?.kind === "slack_channel",
    ).length,
    meeting: items.filter(
      (item) => sourceMap.get(item.source_id)?.kind === "meeting",
    ).length,
    notion_page: items.filter((item) => {
      const kind = sourceMap.get(item.source_id)?.kind;
      return kind === "notion_page" || kind === "document";
    }).length,
  };

  return (
    <main className="workspace-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{department.name}의 워크스페이스</p>
          <h1>오늘, 함께 살펴볼 결정.</h1>
          <p>
            흩어진 대화에서 결정할 순간을 모았습니다. 근거부터 확인해보세요.
          </p>
        </div>
        <Link
          className="button button-primary button-small"
          href={`/demo/d/${dept}/ask`}
        >
          <Icon name="spark" size={15} />
          사수에게 묻기
        </Link>
      </header>
      <nav className="stats-row" aria-label="출처별 기록 보기">
        {(
          [
            { label: "슬랙", kind: "slack", count: sourceCounts.slack_channel, icon: "hash" },
            { label: "회의", kind: "meeting", count: sourceCounts.meeting, icon: "video" },
            { label: "문서", kind: "document", count: sourceCounts.notion_page, icon: "file" },
          ] as const
        ).map(({ label, kind: tileKind, count, icon }) => (
          <Link
            key={label}
            className="stat-card"
            href={`/demo/d/${dept}?kind=${tileKind}#demo-items-heading`}
            aria-current={initialKind === tileKind ? "true" : undefined}
            aria-label={`${label} 기록 ${count}건만 보기`}
          >
            <span>
              <span className="stat-label">{label} 기록</span>
              <strong className="stat-value">
                {count}
                <span className="ml-1.5 text-xs font-normal text-muted">
                  건
                </span>
              </strong>
            </span>
            <span className="stat-icon">
              <Icon name={icon} size={21} />
            </span>
          </Link>
        ))}
      </nav>
      <section className="grid gap-4" aria-labelledby="demo-cards-heading">
        <div className="section-heading">
          <div>
            <h2 id="demo-cards-heading">
              결정 카드 <span>{cards.length}건</span>
            </h2>
            <p>배경과 원문 근거를 확인하고, 다음 방향을 살펴보세요.</p>
          </div>
          <Link className="text-link" href={`/demo/d/${dept}/ledger`}>
            지난 결정 보기 <Icon name="arrow" size={13} />
          </Link>
        </div>
        {cards.length === 0 ? (
          <p className="empty-state">지금 결정할 카드가 없습니다.</p>
        ) : (
          <div className="decision-grid">
            {cards.map((card) => (
              <Link
                key={card.id}
                className="decision-card"
                href={`/demo/d/${dept}/cards/${card.id}`}
              >
                <div className="decision-card-meta">
                  <span
                    className={`badge ${card.status === "open" ? "badge-urgent" : "badge-neutral"}`}
                  >
                    {(
                      {
                        open: "결정 필요",
                        deferred: "보류",
                        decided: "결정 완료",
                        rejected: "반려",
                        needs_review: "검토 필요",
                        generating: "정리 중",
                      } as Record<string, string>
                    )[card.status] ?? "확인 필요"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="lock" size={11} />
                    {card.visibility === "leads_only"
                      ? "팀장 근거 포함"
                      : "부서 전체"}
                  </span>
                </div>
                <h3>{card.title}</h3>
                <footer>
                  <span>원문 근거와 추천 방향</span>
                  <span>
                    카드 상세 보기 <Icon name="arrow" size={14} />
                  </span>
                </footer>
              </Link>
            ))}
          </div>
        )}
      </section>
      <DemoRecords
        key={initialKind ?? "all"}
        dept={dept}
        initialKind={initialKind}
        groups={Object.entries(LABELS).flatMap(([label, name]) => {
          const group = grouped.get(label);
          return group?.length
            ? [
                {
                  label,
                  name,
                  items: group.map((item) => ({
                    id: item.id,
                    author: item.author,
                    content: item.content,
                    sourceId: item.source_id,
                    sourceTitle: sourceMap.get(item.source_id)?.title ?? "입력",
                    sourceKind: recordKind(sourceMap.get(item.source_id)?.kind),
                  })),
                },
              ]
            : [];
        })}
      />
    </main>
  );
}
