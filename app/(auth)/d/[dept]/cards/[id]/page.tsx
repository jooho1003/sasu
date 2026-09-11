import Link from "next/link";
import { notFound } from "next/navigation";

import CardActions from "@/components/card-actions";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CardStatus = "open" | "decided" | "deferred" | "rejected" | "needs_review";

type CardRow = {
  id: string;
  title: string;
  background: string;
  recommendation: string | null;
  deadline: string | null;
  assignee_id: string | null;
  status: CardStatus;
};

type CitationRow = {
  item_id: string | null;
  decision_id: string | null;
  quote: string;
};

type SourceRow = {
  kind: "slack_channel" | "meeting" | "notion_page" | "document";
  external_id: string;
  title: string | null;
};

type ItemRow = {
  id: string;
  author: string | null;
  spoken_at: string | null;
  external_ref: string | null;
  sources: SourceRow | SourceRow[];
};

type DecisionRow = {
  id: string;
  decided_by_name: string;
  decided_at: string | null;
  outcome: string;
  rationale: string;
};

type ConflictRow = {
  id: string;
  prior_decision_id: string;
  explanation: string;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

function firstRelation<T>(relation: T | T[]): T {
  return Array.isArray(relation) ? relation[0] : relation;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "시각 미상";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "시각 미상" : DATE_FORMATTER.format(date);
}

function originalHref(item: ItemRow, deptId: string): string {
  const source = firstRelation(item.sources);
  if (source.kind === "slack_channel" && item.external_ref) {
    return `https://slack.com/archives/${encodeURIComponent(source.external_id)}/p${item.external_ref.replace(/\D/g, "")}`;
  }
  if (source.kind === "notion_page") {
    return source.external_id.startsWith("http")
      ? source.external_id
      : `https://www.notion.so/${source.external_id.replace(/-/g, "")}`;
  }
  return `/d/${deptId}?item=${encodeURIComponent(item.id)}#item-${item.id}`;
}

function deadlineHasPassed(deadline: Date): boolean {
  return deadline.getTime() < new Date().getTime();
}

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ dept: string; id: string }>;
}) {
  const { dept, id } = await params;
  const membership = await requireMembership(dept);
  const supabase = await createServerSupabaseClient();
  const cardResult = await supabase
    .from("decision_requests")
    .select("id, title, background, recommendation, deadline, assignee_id, status")
    .eq("id", id)
    .eq("dept_id", membership.deptId)
    .maybeSingle<CardRow>();

  if (cardResult.error) {
    throw new Error("결정 카드를 불러오지 못했습니다.", { cause: cardResult.error });
  }
  if (!cardResult.data) {
    notFound();
  }

  const card = cardResult.data;
  const [citationsResult, conflictsResult] = await Promise.all([
    supabase
      .from("citations")
      .select("item_id, decision_id, quote")
      .eq("owner_kind", "decision_request")
      .eq("owner_id", card.id),
    supabase
      .from("conflicts")
      .select("id, prior_decision_id, explanation")
      .eq("request_id", card.id),
  ]);

  if (citationsResult.error || conflictsResult.error) {
    throw new Error("카드 근거를 불러오지 못했습니다.");
  }

  const citations = (citationsResult.data ?? []) as CitationRow[];
  const conflicts = (conflictsResult.data ?? []) as ConflictRow[];
  const itemIds = citations.flatMap((citation) => citation.item_id ? [citation.item_id] : []);
  const decisionIds = [
    ...new Set([
      ...citations.flatMap((citation) => citation.decision_id ? [citation.decision_id] : []),
      ...conflicts.map((conflict) => conflict.prior_decision_id),
    ]),
  ];

  const [itemsResult, decisionsResult] = await Promise.all([
    itemIds.length === 0
      ? Promise.resolve({ data: [] as ItemRow[], error: null })
      : supabase
          .from("items")
          .select("id, author, spoken_at, external_ref, sources!inner(kind, external_id, title)")
          .in("id", itemIds),
    decisionIds.length === 0
      ? Promise.resolve({ data: [] as DecisionRow[], error: null })
      : supabase
          .from("decisions")
          .select("id, decided_by_name, decided_at, outcome, rationale")
          .in("id", decisionIds),
  ]);

  if (itemsResult.error || decisionsResult.error) {
    throw new Error("인용 원문을 불러오지 못했습니다.");
  }

  const itemMap = new Map(((itemsResult.data ?? []) as ItemRow[]).map((item) => [item.id, item]));
  const decisionMap = new Map(
    ((decisionsResult.data ?? []) as DecisionRow[]).map((decision) => [decision.id, decision]),
  );
  const visibleCitations = citations.flatMap((citation) => {
    if (citation.item_id) {
      const item = itemMap.get(citation.item_id);
      if (!item) {
        return [];
      }
      const source = firstRelation(item.sources);
      return [{
        quote: citation.quote,
        author: item.author ?? "작성자 미상",
        occurredAt: item.spoken_at,
        source: source.title ?? "이름 없는 소스",
        href: originalHref(item, membership.deptId),
      }];
    }
    if (citation.decision_id) {
      const decision = decisionMap.get(citation.decision_id);
      if (!decision) {
        return [];
      }
      return [{
        quote: citation.quote,
        author: decision.decided_by_name,
        occurredAt: decision.decided_at,
        source: `원장 #${decision.id.slice(0, 8)}`,
        href: `/d/${membership.deptId}/ledger#decision-${decision.id}`,
      }];
    }
    return [];
  });

  const lacksVerifiedEvidence = card.status === "needs_review" || visibleCitations.length === 0;
  const deadline = card.deadline ? new Date(card.deadline) : null;
  const overdue = deadline !== null && !Number.isNaN(deadline.getTime()) && deadlineHasPassed(deadline) &&
    (card.status === "open" || card.status === "deferred");
  const canAct = membership.role === "lead" || card.assignee_id === membership.userId;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-5 py-10 text-left sm:px-8">
      <nav className="flex flex-wrap gap-4 text-sm">
        <Link href={`/d/${membership.deptId}`}>대시보드</Link>
        <Link href={`/d/${membership.deptId}/ledger`}>결정 원장</Link>
      </nav>

      <article className="grid gap-6 rounded-3xl border-l-4 border-l-[var(--urgent)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <header className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--urgent)] px-3 py-1 text-xs font-bold text-white">
              지금 결정
            </span>
            {overdue ? (
              <span className="rounded-full border border-[var(--urgent)] px-3 py-1 text-xs font-bold text-[var(--urgent)]">
                마감 지남
              </span>
            ) : null}
          </div>
          <h1 className="text-3xl! text-[var(--ink)]! sm:text-4xl!">{card.title}</h1>
          <p className="m-0 text-sm text-[var(--muted)]" data-meta>
            마감 · {deadline && !Number.isNaN(deadline.getTime()) ? formatDate(card.deadline) : "마감 미정"}
          </p>
        </header>

        {lacksVerifiedEvidence ? (
          <section className="rounded-2xl bg-[var(--urgent)]/10 p-5">
            <h2 className="m-0 text-xl">근거를 확인하지 못했습니다 — lead 검토 필요</h2>
            <p className="mb-0 text-[var(--muted)]">
              검증된 인용이 없어 카드 본문과 추천 방향을 표시하지 않습니다.
            </p>
          </section>
        ) : (
          <>
            <section className="grid gap-2">
              <h2 className="m-0 text-xl">배경</h2>
              <p className="m-0 whitespace-pre-wrap leading-7">{card.background}</p>
            </section>

            <section className="grid gap-3">
              <h2 className="m-0 text-xl">근거 인용</h2>
              <div className="grid gap-3">
                {visibleCitations.map((citation, index) => (
                  <a
                    key={`${citation.href}-${index}`}
                    className="grid gap-2 rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent)]/5 p-4 no-underline"
                    href={citation.href}
                  >
                    <span className="text-xs text-[var(--muted)]" data-meta>
                      {citation.author} · {formatDate(citation.occurredAt)} · {citation.source}
                    </span>
                    <q className="font-normal leading-7 text-[var(--ink)]">{citation.quote}</q>
                  </a>
                ))}
              </div>
            </section>

            {conflicts.length > 0 ? (
              <section className="grid gap-3 rounded-2xl border border-[var(--urgent)]/30 bg-[var(--urgent)]/5 p-5">
                <h2 className="m-0 text-xl text-[var(--urgent)]">과거 결정과 충돌</h2>
                {conflicts.map((conflict) => {
                  const prior = decisionMap.get(conflict.prior_decision_id);
                  return (
                    <div key={conflict.id} className="grid gap-1">
                      <p className="m-0 leading-7">{conflict.explanation}</p>
                      {prior ? (
                        <div className="grid gap-1">
                          <q className="text-sm text-[var(--muted)]">
                            {prior.outcome} — {prior.rationale}
                          </q>
                          <Link href={`/d/${membership.deptId}/ledger#decision-${prior.id}`}>
                            원장 #{prior.id.slice(0, 8)}에서 근거 보기
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </section>
            ) : null}

            {card.recommendation ? (
              <section className="grid gap-2">
                <h2 className="m-0 text-xl">추천 방향</h2>
                <p className="m-0 whitespace-pre-wrap leading-7">{card.recommendation}</p>
              </section>
            ) : null}
          </>
        )}

        <section className="border-t border-black/10 pt-6">
          <CardActions
            canAct={canAct}
            cardId={card.id}
            deptId={membership.deptId}
            isLead={membership.role === "lead"}
            outcome={card.recommendation ?? card.title}
            status={card.status}
          />
        </section>
      </article>
    </main>
  );
}
