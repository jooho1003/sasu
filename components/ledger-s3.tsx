"use client";

import { labelFrom } from "@/lib/labels";
import { useEffect, useState } from "react";

import { formatConflictBadge } from "@/lib/conflicts";
import { DecisionCorrection } from "@/components/decision-correction";
import { EvidencePicker } from "@/components/evidence-picker";
import type { EvidenceOption } from "@/lib/evidence-options";

type LedgerCitation = {
  quote: string;
  author: string;
  occurred_at: string | null;
  source: string;
  href: string;
};

type LedgerConflict = {
  id: string;
  explanation: string;
  prior_decision_id: string;
  prior_decided_at: string | null;
};

type LedgerDecision = {
  can_correct: boolean;
  id: string;
  status: string;
  assignee_id: string | null;
  assignee_name: string;
  decided_by_name: string;
  decided_at: string | null;
  outcome: string;
  rationale: string;
  lead_time_min: number | null;
  has_evidence: boolean;
  citations: LedgerCitation[];
  conflicts: LedgerConflict[];
  history: LedgerDecision[];
};

type LedgerData = {
  decisions: LedgerDecision[];
  members: { id: string; name: string }[];
  evidenceOptions: (EvidenceOption & {label:string})[];
};

type Filters = {
  status: string;
  assignee: string;
  from: string;
  to: string;
};

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

function formatLeadTime(value: number | null): string {
  if (value === null) {
    return "직접 기록";
  }
  if (value < 60) {
    return `${value}분`;
  }
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

function filterDate(value: string, endOfDay: boolean): string | null {
  if (!value) {
    return null;
  }
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}+09:00`).toISOString();
}

function DecisionDetail({ decision, historical = false }: { decision: LedgerDecision; historical?: boolean }) {
  return (
    <article
      className={`grid gap-4 ${historical ? "border-t border-black/10 pt-4" : ""}`}
      id={historical ? undefined : `decision-${decision.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--accent)]/10 px-3 py-1 text-xs font-bold text-[var(--accent)]">
              {labelFrom("ledgerStatus", decision.status)}
            </span>
            {!decision.has_evidence ? (
              <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-bold text-[var(--muted)]">
                근거 없음
              </span>
            ) : null}
            {decision.conflicts.length > 0 ? (
              <span className="rounded-full bg-[var(--urgent)]/10 px-3 py-1 text-xs font-bold text-[var(--urgent)]">
                예전 결정과 다름
              </span>
            ) : null}
          </div>
          <h2 className={`${historical ? "text-lg" : "text-2xl"} m-0`}>{decision.outcome}</h2>
        </div>
        <span className="text-xs text-[var(--muted)]" data-meta>
          결정 기록 #{decision.id.slice(0, 8)}
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[var(--muted)]">담당자</dt>
          <dd className="m-0 font-bold">{decision.assignee_name}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">결정 시각</dt>
          <dd className="m-0 font-bold">{formatDate(decision.decided_at)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">걸린 시간</dt>
          <dd className="m-0 font-bold">{formatLeadTime(decision.lead_time_min)}</dd>
        </div>
      </dl>

      <div className="grid gap-1">
        <p className="m-0 text-xs text-[var(--muted)]" data-meta>
          {decision.decided_by_name}의 사유
        </p>
        <p className="m-0 whitespace-pre-wrap leading-7">{decision.rationale}</p>
      </div>

      {decision.citations.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="m-0 text-base">근거</h3>
          {decision.citations.map((citation, index) => (
            <a
              key={`${citation.href}-${index}`}
              className="grid gap-1 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3 no-underline"
              href={citation.href}
            >
              <span className="text-xs text-[var(--muted)]" data-meta>
                {citation.author} · {formatDate(citation.occurred_at)} · {citation.source}
              </span>
              <q className="font-normal text-[var(--ink)]">{citation.quote}</q>
            </a>
          ))}
        </div>
      ) : null}

      {decision.conflicts.length > 0 ? (
        <div className="grid gap-2 rounded-xl bg-[var(--urgent)]/5 p-4">
          {decision.conflicts.map((conflict) => (
            <div key={conflict.id} className="grid gap-1">
              <a className="w-fit text-sm font-bold text-[var(--urgent)]" href={`#decision-${conflict.prior_decision_id}`}>
                {formatConflictBadge(conflict.prior_decided_at)}
              </a>
              <p className="m-0 text-sm leading-6">{conflict.explanation}</p>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function LedgerS3({ deptId }: { deptId: string }) {
  const [filters, setFilters] = useState<Filters>({ status: "", assignee: "", from: "", to: "" });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [outcome, setOutcome] = useState("");
  const [rationale, setRationale] = useState("");
  const [evidenceItemId, setEvidenceItemId] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordMessage, setRecordMessage] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);

  useEffect(() => {
    let cancelled = false;

    const loadLedger = async () => {
      const query = new URLSearchParams();
      if (appliedFilters.status) query.set("status", appliedFilters.status);
      if (appliedFilters.assignee) query.set("assignee", appliedFilters.assignee);
      const from = filterDate(appliedFilters.from, false);
      const to = filterDate(appliedFilters.to, true);
      if (from) query.set("from", from);
      if (to) query.set("to", to);

      try {
        const response = await fetch(
          `/api/d/${encodeURIComponent(deptId)}/ledger?${query.toString()}`,
          { cache: "no-store" },
        );
        const body = (await response.json()) as LedgerData & { error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? "결정 기록을 불러오지 못했습니다.");
        }
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "결정 기록을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadLedger();
    return () => {
      cancelled = true;
    };
  }, [appliedFilters, deptId, refreshKey]);

  const recordDecision = async () => {
    if (!outcome.trim() || !rationale.trim()) {
      setRecordMessage("결정 결과와 사유를 모두 입력해주세요.");
      return;
    }

    setRecording(true);
    setRecordMessage(null);
    try {
      const response = await fetch(`/api/d/${encodeURIComponent(deptId)}/decisions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outcome,
          rationale,
          evidence_item_id: evidenceItemId || null,
        }),
      });
      const body = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "결정을 기록하지 못했습니다.");
      }
      setOutcome("");
      setRationale("");
      setEvidenceItemId("");
      setRecordMessage(body.message ?? "결정을 기록에 남겼습니다.");
      setRefreshKey((value) => value + 1);
    } catch (recordError) {
      setRecordMessage(
        recordError instanceof Error ? recordError.message : "결정을 기록하지 못했습니다.",
      );
    } finally {
      setRecording(false);
    }
  };

  return (
    <main className="workspace-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <p className="m-0 text-sm font-bold text-[var(--accent)]">사수</p>
          <h1 className="m-0 text-3xl">결정 기록</h1>
          <p className="m-0 text-[var(--muted)]">부서의 결정과 근거를 최신순으로 봅니다.</p>
        </div>

      </header>

      <details id="direct-record" className="panel p-5">
        <summary className="cursor-pointer font-bold text-[var(--accent)]">직접 기록</summary>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 font-bold">
            결정 결과
            <input
              className="rounded-xl border border-black/15 bg-[var(--surface)] p-3 font-normal"
              maxLength={300}
              onChange={(event) => setOutcome(event.target.value)}
              value={outcome}
            />
          </label>
          <label className="grid gap-2 font-bold">
            사유
            <textarea
              className="min-h-28 rounded-xl border border-black/15 bg-[var(--surface)] p-3 font-normal"
              maxLength={1000}
              onChange={(event) => setRationale(event.target.value)}
              value={rationale}
            />
          </label>
          <EvidencePicker options={data?.evidenceOptions??[]} value={evidenceItemId} onChange={setEvidenceItemId} optional />
          <button
            className="w-fit rounded-lg bg-[var(--accent)] px-5 py-3 font-bold text-white disabled:opacity-50"
            disabled={recording}
            onClick={() => void recordDecision()}
            type="button"
          >
            {recording ? "기록 중…" : "결정 남기기"}
          </button>
          {recordMessage ? <p aria-live="polite" className="m-0 text-sm">{recordMessage}</p> : null}
        </div>
      </details>

      <form
        className="grid gap-3 panel p-5 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedFilters(filters);
          setVisibleCount(10);
        }}
      >
        <label className="grid gap-1 text-sm font-bold">
          상태
          <select
            className="rounded-lg border border-black/15 bg-[var(--surface)] p-2 font-normal"
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            value={filters.status}
          >
            <option value="">전체</option>
            <option value="decided">결정 완료</option>
            <option value="direct">직접 기록</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold">
          담당자
          <select
            className="rounded-lg border border-black/15 bg-[var(--surface)] p-2 font-normal"
            onChange={(event) => setFilters((current) => ({ ...current, assignee: event.target.value }))}
            value={filters.assignee}
          >
            <option value="">전체</option>
            {(data?.members ?? []).map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold">
          시작일
          <input
            className="rounded-lg border border-black/15 bg-[var(--surface)] p-2 font-normal"
            onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
            type="date"
            value={filters.from}
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          종료일
          <input
            className="rounded-lg border border-black/15 bg-[var(--surface)] p-2 font-normal"
            onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
            type="date"
            value={filters.to}
          />
        </label>
        <button className="self-end rounded-lg border border-[var(--accent)] px-4 py-2 font-bold text-[var(--accent)]" type="submit">
          필터 적용
        </button>
      </form>

      {loading ? (
        <div className="rounded-2xl bg-[var(--surface)] p-8 text-[var(--muted)]">결정 기록을 불러오는 중입니다.</div>
      ) : null}
      {error ? (
        <div className="grid gap-3 rounded-2xl bg-[var(--surface)] p-8">
          <p className="m-0">{error}</p>
          <button className="w-fit rounded-lg bg-[var(--accent)] px-4 py-2 font-bold text-white" onClick={() => setRefreshKey((value) => value + 1)} type="button">
            다시 시도
          </button>
        </div>
      ) : null}

      {!loading && !error && data?.decisions.length === 0 ? (
        <div className="grid gap-3 rounded-2xl bg-[var(--surface)] p-8 shadow-sm">
          <h2 className="m-0 text-2xl">첫 결정을 직접 기록해보세요</h2>
          <p className="m-0 text-[var(--muted)]">결과와 사유를 남기면 부서의 첫 선례가 됩니다.</p>
          <a className="w-fit" href="#direct-record">직접 기록</a>
        </div>
      ) : null}

      {!loading && !error && data && data.decisions.length > 0 ? (
        <section aria-label="결정 목록" className="grid gap-4">
          <p className="m-0 text-sm text-[var(--muted)]">
            전체 {data.decisions.length}건 중 {Math.min(visibleCount, data.decisions.length)}건 표시
          </p>
          {data.decisions.slice(0, visibleCount).map((decision) => (
            <div key={decision.id} className="panel p-5 sm:p-6">
              <DecisionDetail decision={decision} />
              {decision.can_correct ? <DecisionCorrection deptId={deptId} previousId={decision.id} initialOutcome={decision.outcome} onDone={() => setRefreshKey(value => value + 1)} /> : null}
              {decision.history.length > 0 ? (
                <details className="mt-5 border-t border-black/10 pt-4">
                  <summary className="cursor-pointer text-sm font-bold text-[var(--muted)]">
                    고친 기록 {decision.history.length}건
                  </summary>
                  <div className="mt-4 grid gap-4">
                    {decision.history.map((historicalDecision) => (
                      <DecisionDetail key={historicalDecision.id} decision={historicalDecision} historical />
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ))}
          {data.decisions.length > visibleCount ? (
            <button
              className="button button-secondary w-fit"
              type="button"
              onClick={() => setVisibleCount((count) => count + 10)}
            >
              결정 10건 더 보기
            </button>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
