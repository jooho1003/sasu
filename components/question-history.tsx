"use client";

import { useEffect, useState } from "react";
type Question = { id: string; question: string; created_at: string; status: string; parent_id: string | null };
type Cursor = { before: string; before_id: string } | null;
const labels: Record<string,string> = { pending: "답변 작성 중", done: "답변 완료", refused: "근거 부족", failed: "답변 실패" };
export function QuestionHistory({ deptId, revision, onSelect }: { deptId: string; revision: number; onSelect: (id: string, question: string) => Promise<void> }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [page, setPage] = useState<Cursor>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setBusy(true);
      try {
        const query = page ? `?${new URLSearchParams(page)}` : "";
        const response = await fetch(`/api/d/${encodeURIComponent(deptId)}/questions${query}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json() as { questions: Question[]; next: Cursor; error?: string };
        if (!response.ok) throw new Error(body.error);
        if (!controller.signal.aborted) { setQuestions(body.questions); setCursor(body.next); setError(null); }
      } catch { if (!controller.signal.aborted) setError("질문 기록을 불러오지 못했습니다."); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    })();
    return () => controller.abort();
  }, [deptId, revision, page, retry]);
  const filtered = statusFilter ? questions.filter((question) => question.status === statusFilter) : questions;
  const visible = expanded ? filtered : filtered.slice(0, 5);
  return <section className="panel grid gap-3 p-5" aria-label="내 질문 기록">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="m-0 text-xl">내 질문 기록</h2><p className="mb-0 mt-1 text-sm text-[var(--muted)]">최근 질문 5개를 먼저 보여드려요.</p></div>
      <label className="grid gap-1 text-xs font-bold text-[var(--muted)]">상태
        <select className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm font-normal text-[var(--ink)]" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setExpanded(false); }}>
          <option value="">전체</option><option value="done">답변 완료</option><option value="refused">근거 부족</option><option value="failed">답변 실패</option><option value="pending">답변 작성 중</option>
        </select>
      </label>
    </div>
    {busy ? <p role="status">질문 기록을 불러오는 중…</p> : null}
    {!busy && !error && !questions.length ? <p className="m-0 text-sm">아직 질문 기록이 없습니다.</p> : null}
    {error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(v => v + 1)}>다시 시도</button></p> : null}
    {!error ? visible.map(q => <button key={q.id} type="button" className="grid gap-1 rounded-lg border border-black/10 p-3 text-left hover:bg-black/5" onClick={async () => {
      try { await onSelect(q.id, q.question); } catch { setError("현재 이 답변을 확인할 수 없습니다. 새 질문으로 시작해주세요."); }
    }}><span className="font-bold">{q.question}</span><span className="text-xs text-[var(--muted)]">{labels[q.status]} · {new Date(q.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}{q.parent_id ? " · 이어진 질문" : ""}</span></button>) : null}
    <div className="flex gap-4 text-sm font-bold text-[var(--accent)]">
      {!expanded && filtered.length > 5 ? <button type="button" onClick={() => setExpanded(true)}>이 페이지 {filtered.length - 5}개 더 보기</button> : null}
      {expanded && filtered.length > 5 ? <button type="button" onClick={() => setExpanded(false)}>최근 5개만 보기</button> : null}
      {page ? <button disabled={busy} type="button" onClick={() => { setPage(null); setExpanded(false); }}>최신 질문</button> : null}
      {cursor ? <button disabled={busy} type="button" onClick={() => { setPage(cursor); setExpanded(false); }}>이전 질문</button> : null}
    </div>
  </section>;
}
