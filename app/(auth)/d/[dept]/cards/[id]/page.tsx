import Link from "next/link";
import { notFound } from "next/navigation";

import CardActions from "@/components/card-actions";
import { CardReminder } from "@/components/card-reminder";
import { loadCardView } from "@/lib/card-view";
import { actorFromMembership } from "@/lib/companion/context";
import { formatConflictBadge } from "@/lib/conflicts";
import { label } from "@/lib/labels";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

function formatDate(value: string | null): string {
  if (!value) {
    return "시각 미상";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "시각 미상" : DATE_FORMATTER.format(date);
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
  const view = await loadCardView(actorFromMembership(supabase, membership), id);
  if (!view.ok) {
    if (view.status === 404) notFound();
    throw new Error(view.error);
  }
  const { card, citations: visibleCitations, conflicts, decisions } = view.body;
  const decisionMap = new Map(decisions.map((decision) => [decision.id, decision]));

  const lacksVerifiedEvidence = card.status === "needs_review" || visibleCitations.length === 0;
  const deadline = card.deadline ? new Date(card.deadline) : null;
  const overdue = deadline !== null && !Number.isNaN(deadline.getTime()) && deadlineHasPassed(deadline) &&
    (card.status === "open" || card.status === "deferred");
  const canAct = membership.role === "lead" || card.assignee_id === membership.userId;

  return (
    <main className="workspace-page">
      <Link className="text-link" href={`/d/${membership.deptId}`}>← 대시보드</Link>

      <article className="grid gap-6 panel border-l-4 border-l-[var(--urgent)] p-6 shadow-sm sm:p-8">
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
          <h1 className="m-0 text-2xl sm:text-3xl">{card.title}</h1>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <div><dt className="text-muted">마감</dt><dd className="m-0">{deadline&&!Number.isNaN(deadline.getTime())?formatDate(card.deadline):"마감 미정"}</dd></div>
            <div><dt className="text-muted">결정하는 사람</dt><dd className="m-0">{card.assignee_id===membership.userId?"나 또는 팀장":card.assignee_id?"담당자 또는 팀장":"팀장"}</dd></div>
            <div><dt className="text-muted">볼 수 있는 사람</dt><dd className="m-0">{label("visibility",card.visibility)}</dd></div>
            <div><dt className="text-muted">근거</dt><dd className="m-0">{visibleCitations.length}개</dd></div>
            <div><dt className="text-muted">상태</dt><dd className="m-0">{label("cardStatus",card.status)}</dd></div>
          </dl>
        </header>

        {lacksVerifiedEvidence ? (
          <section className="rounded-2xl bg-[var(--urgent)]/10 p-5">
            <h2 className="m-0 text-xl">근거를 확인하지 못했습니다 · 팀장 검토 필요</h2>
            <p className="mb-0 text-[var(--muted)]">
              원문과 맞는 근거를 찾지 못해 내용을 보여 주지 않습니다. 팀장이 확인한 뒤 다시 만들 수 있습니다.
            </p>
          </section>
        ) : (
          <>
            <section className="grid gap-2">
              <h2 className="m-0 text-xl">무슨 일인가요</h2>
              <p className="m-0 whitespace-pre-wrap leading-7">{card.background}</p>
            </section>

            <section className="grid gap-3">
              <h2 className="m-0 text-xl">원문 근거</h2>
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
                      {citation.lowConfidence ? <span className="badge badge-urgent">낮은 신뢰</span> : null}
                      {citation.boundaryReview ? <span className="badge badge-urgent">경계 확인 필요</span> : null}
                  </a>
                ))}
              </div>
            </section>

            {conflicts.length > 0 ? (
              <section className="grid gap-3 rounded-2xl border border-[var(--urgent)]/30 bg-[var(--urgent)]/5 p-5">
                <h2 className="m-0 text-xl text-[var(--urgent)]">예전 결정과 다름</h2>
                {conflicts.map((conflict) => {
                  const prior = decisionMap.get(conflict.prior_decision_id);
                  return (
                    <div key={conflict.id} className="grid gap-1">
                      <p className="m-0 leading-7">{conflict.explanation}</p>
                      {prior ? (
                        <div className="grid gap-1">
                          <Link className="w-fit text-sm font-bold text-[var(--urgent)]" href={`/d/${membership.deptId}/ledger#decision-${prior.id}`}>
                            {formatConflictBadge(prior.decided_at)}
                          </Link>
                          <q className="text-sm text-[var(--muted)]">
                            {prior.outcome} — {prior.rationale}
                          </q>
                          <Link href={`/d/${membership.deptId}/ledger#decision-${prior.id}`}>
                            결정 기록 #{prior.id.slice(0, 8)}에서 근거 보기
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
                <h2 className="m-0 text-xl">사수의 제안</h2>
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
          {canAct && (card.status === "open" || card.status === "deferred") ? <CardReminder deptId={membership.deptId} cardId={card.id} /> : null}
        </section>
      </article>
    </main>
  );
}
