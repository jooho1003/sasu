"use client";

import { useEffect, useState } from "react";
import type { SalesReviewConditionChecklist } from "@/lib/sales-review-condition-checklist";

type Candidate = { item_id: string; title: string; kind: string; quote: string; is_principles: boolean };
type Role = "request" | "old_quote" | "new_quote" | "policy";
type PreviewSource = Candidate & { href: string };
type Preview = { sources: Record<Role, PreviewSource> };
type DifferenceEntry = { source_id: string; quote: string; href: string };
type Comparison = Preview & { difference: {
  old_only: DifferenceEntry[]; new_only: DifferenceEntry[];
  old_only_total: number; new_only_total: number; truncated: boolean;
} };

const ROLES: { id: Role; label: string }[] = [
  { id: "request", label: "고객 요청" },
  { id: "old_quote", label: "기존 견적" },
  { id: "new_quote", label: "변경 견적" },
  { id: "policy", label: "영업 원칙" },
];
const emptySelection: Record<Role, string> = { request: "", old_quote: "", new_quote: "", policy: "" };

export default function SalesReviewSources({ deptId }: { deptId: string }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selection, setSelection] = useState<Record<Role, string>>(emptySelection);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [comparison, setComparison] = useState<Comparison["difference"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checklist, setChecklist] = useState<SalesReviewConditionChecklist["topics"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endpoint = `/api/d/${encodeURIComponent(deptId)}/sales-review/sources`;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        const body = (await response.json()) as { candidates?: Candidate[]; error?: string };
        if (!response.ok || !body.candidates) throw new Error(body.error ?? "원문 목록을 불러오지 못했습니다.");
        setCandidates(body.candidates);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "원문 목록을 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [endpoint]);

  async function connect() {
    const ids = Object.values(selection);
    if (ids.some((id) => !id) || new Set(ids).size !== 4) {
      setError("서로 다른 원문 4건을 선택해 주세요.");
      setPreview(null);
      setComparison(null);
      setChecklist(null);
      return;
    }
    setBusy(true);
    setError(null);
    setPreview(null);
    setComparison(null);
    setChecklist(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ request_item_id: selection.request, old_quote_item_id: selection.old_quote,
          new_quote_item_id: selection.new_quote, policy_item_id: selection.policy }),
      });
      const body = (await response.json()) as Preview & { error?: string };
      if (!response.ok || !body.sources) throw new Error(body.error ?? "원문을 연결하지 못했습니다.");
      setPreview({ sources: body.sources });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "원문을 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function compare() {
    if (!preview) return;
    setComparing(true);
    setError(null);
    setComparison(null);
    setChecklist(null);
    try {
      const response = await fetch(`/api/d/${encodeURIComponent(deptId)}/sales-review/compare`, {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ request_item_id: selection.request, old_quote_item_id: selection.old_quote,
          new_quote_item_id: selection.new_quote, policy_item_id: selection.policy }),
      });
      const body = (await response.json()) as Comparison & { error?: string };
      if (!response.ok || !body.sources || !body.difference) throw new Error(body.error ?? "문구를 비교하지 못했습니다.");
      setPreview({ sources: body.sources });
      setComparison(body.difference);
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : "문구를 비교하지 못했습니다.");
    } finally {
      setComparing(false);
    }
  }

  async function checkConditions() {
    if (!preview) return;
    setChecking(true);
    setError(null);
    setChecklist(null);
    setComparison(null);
    try {
      const response = await fetch(`/api/d/${encodeURIComponent(deptId)}/sales-review/checklist`, {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ request_item_id: selection.request, old_quote_item_id: selection.old_quote,
          new_quote_item_id: selection.new_quote, policy_item_id: selection.policy }),
      });
      const body = (await response.json()) as SalesReviewConditionChecklist & { error?: string };
      if (!response.ok || !body.sources || !body.topics) throw new Error(body.error ?? "조건 확인 질문을 준비하지 못했습니다.");
      setPreview({ sources: body.sources });
      setChecklist(body.topics);
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : "조건 확인 질문을 준비하지 못했습니다.");
    } finally {
      setChecking(false);
    }
  }

  return <section className="panel grid gap-4 p-6" aria-labelledby="real-sales-sources-heading">
    <div className="grid gap-1">
      <p className="m-0 text-sm text-[var(--muted)]">실제 부서 기록 · 팀장 전용</p>
      <h2 className="m-0 text-2xl" id="real-sales-sources-heading">검토할 원문 연결</h2>
      <p className="m-0 text-sm leading-6 text-[var(--muted)]">현재 볼 수 있는 원문을 역할별로 고릅니다. 선택은 저장되지 않으며 금액·일정을 자동으로 해석하지 않습니다.</p>
    </div>
    {loading ? <p role="status">원문을 불러오는 중입니다.</p> : candidates.length === 0 ? <p>연결할 원문이 없습니다. <a className="underline" href={`/d/${encodeURIComponent(deptId)}/documents`}>부서 자료 보기</a></p> : <>
      {!candidates.some((candidate) => candidate.is_principles) ? <p className="m-0 text-sm" role="status">활성 원칙 문서의 원문이 없습니다. 부서 원칙 문서를 연결한 뒤 다시 열어 주세요.</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {ROLES.map(({ id, label }) => <label className="grid gap-2 text-sm font-bold" key={id}>{label}
          <select className="min-w-0 rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" disabled={busy || comparing || checking} value={selection[id]}
            onChange={(event) => { setSelection((current) => ({ ...current, [id]: event.target.value })); setPreview(null); setComparison(null); setChecklist(null); }}>
            <option value="">원문 선택</option>
            {candidates.filter((candidate) => id !== "policy" || candidate.is_principles).map((candidate) =>
              <option key={candidate.item_id} value={candidate.item_id}>{candidate.title} · {candidate.quote.slice(0, 45)}</option>)}
          </select>
        </label>)}
      </div>
      <button className="w-fit rounded-lg border border-[var(--accent)] px-4 py-2 font-bold text-[var(--accent)] disabled:opacity-50" disabled={busy || comparing || checking}
        onClick={() => void connect()} type="button">{busy ? "확인 중…" : "원문 나란히 보기"}</button>
    </>}
    {error ? <p className="m-0 rounded-xl bg-[var(--urgent)]/10 p-3" role="alert">{error}</p> : null}
    {preview ? <div className="grid gap-3 lg:grid-cols-2" aria-label="선택한 원문 대조">
      {ROLES.map(({ id, label }) => <article className="rounded-xl border border-black/10 bg-white p-4" key={id}>
        <h3 className="mt-0 text-base">{label} · {preview.sources[id].title}</h3>
        <blockquote className="m-0 whitespace-pre-wrap text-sm leading-6">{preview.sources[id].quote}</blockquote>
        <a className="mt-3 inline-block text-sm font-bold text-[var(--accent)] underline" href={preview.sources[id].href}>원문 열기</a>
      </article>)}
    </div> : null}
    {preview ? <button className="w-fit rounded-lg bg-[var(--accent)] px-4 py-2 font-bold text-white disabled:opacity-50"
      disabled={busy || comparing || checking} onClick={() => void compare()} type="button">{comparing ? "비교 중…" : "견적 문구 차이 보기"}</button> : null}
    {preview ? <button className="w-fit rounded-lg border border-[var(--accent)] px-4 py-2 font-bold text-[var(--accent)] disabled:opacity-50"
      disabled={busy || comparing || checking} onClick={() => void checkConditions()} type="button">{checking ? "조건 찾는 중…" : "조건 확인 질문 보기"}</button> : null}
    {checking ? <p className="m-0 text-sm" role="status">현재 원문에서 확인할 조건을 찾고 있습니다.</p> : null}
    {checklist ? <section className="grid gap-4 rounded-xl border border-black/10 bg-white p-4" aria-label="영업 조건 확인 질문">
      <div><h3 className="m-0 text-lg">영업 조건 확인 질문</h3>
        <p className="m-0 text-sm leading-6 text-[var(--muted)]">정해진 관련 단어가 있는 원문 줄을 모았습니다. 질문은 검토를 돕는 안내입니다. 조건의 의미와 충족 여부는 원문에서 확인해 주세요.</p></div>
      {checklist.map(topic => <article className="grid gap-3 rounded-xl border border-black/10 p-4" key={topic.id} aria-label={`${topic.label} 조건 확인`}>
        <h4 className="m-0 text-base">{topic.label}</h4>
        {topic.question ? <p className="m-0 font-bold">{topic.question}</p> : <p className="m-0 text-sm">정해진 관련 단어를 찾지 못했습니다. 원문을 직접 확인해 주세요.</p>}
        {ROLES.filter(({ id }) => topic.matches[id] > 0).map(({ id, label }) => <section className="grid gap-2" key={id}>
          <h5 className="m-0 text-sm">{label} · 관련 줄 전체 {topic.matches[id]}건</h5>
          <ul className="m-0 grid list-none gap-2 p-0">
            {topic.evidence.filter(entry => entry.role === id).map((entry, index) => <li className="rounded-lg bg-black/5 p-3" key={`${entry.source_id}-${index}`}>
              <blockquote className="m-0 whitespace-pre-wrap break-words text-sm leading-6">{entry.quote}</blockquote>
              <a className="mt-2 inline-block text-sm font-bold text-[var(--accent)] underline" href={entry.href}>원문에서 확인</a>
            </li>)}
          </ul>
        </section>)}
        {topic.truncated ? <p className="m-0 text-sm" role="status">자료별 앞 3개 관련 줄만 표시했습니다. 전체 건수는 각 자료 위에 표시했습니다.</p> : null}
      </article>)}
    </section> : null}
    {comparison ? <section className="grid gap-4 rounded-xl border border-black/10 bg-white p-4" aria-label="견적 원문 문구 차이">
      <div><h3 className="m-0 text-lg">견적 원문 문구 차이</h3><p className="m-0 text-sm text-[var(--muted)]">앞뒤 공백을 제외한 원문 문구의 등장 횟수를 비교했습니다. 금액·일정·계약 조건의 의미는 원문에서 확인해 주세요.</p></div>
      {comparison.old_only_total === 0 && comparison.new_only_total === 0 ? <p className="m-0">서로 다른 문구를 찾지 못했습니다.</p> : <div className="grid gap-4 lg:grid-cols-2">
        {([
          { label: "기존 견적에서 더 많이 나온 문구", rows: comparison.old_only, total: comparison.old_only_total },
          { label: "변경 견적에서 더 많이 나온 문구", rows: comparison.new_only, total: comparison.new_only_total },
        ] as const).map(({ label, rows, total }) => <section className="grid content-start gap-2" key={label}>
          <h4 className="m-0 text-base">{label} · 전체 {total}건</h4>
          {rows.length === 0 ? <p className="m-0 text-sm">없음</p> : <ul className="m-0 grid list-none gap-2 p-0">
            {rows.map((row, index) => <li className="rounded-lg border border-black/10 p-3" key={`${row.source_id}-${index}`}>
              <q className="block whitespace-pre-wrap text-sm">{row.quote}</q>
              <a className="mt-2 inline-block text-sm font-bold text-[var(--accent)] underline" href={row.href}>원문에서 확인</a>
            </li>)}
          </ul>}
        </section>)}
      </div>}
      {comparison.truncated ? <p className="m-0 text-sm" role="status">화면에는 각 쪽의 앞 8건만 표시했습니다. 전체 건수는 위에 표시했습니다.</p> : null}
    </section> : null}
  </section>;
}
