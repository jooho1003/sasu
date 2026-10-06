"use client";

import Link from "next/link";
import { useState } from "react";
import type { DemoWorkspaceData, DemoDecision } from "@/lib/demo-workspace";
import { useDemoWorkspace } from "./demo-workspace-state";
import { DocumentSummarySections } from "./document-summary-sections";

export function DemoDocumentWorkspace({ dept, data, ledger = false, initialSource }: { dept: string; data: DemoWorkspaceData; ledger?: boolean; initialSource?: string }) {
  const { decisions: added, append } = useDemoWorkspace();
  const [sourceId, setSourceId] = useState(initialSource ?? "all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("");
  const [rationale, setRationale] = useState("");
  const [notice, setNotice] = useState("");
  const decisions = [...data.decisions, ...added];
  const belongsTo = (row: DemoDecision, id: string) => row.source_id === id || row.source_ids?.includes(id);
  const isPending = (row: DemoDecision) => row.status === "deferred" && !decisions.some(next => next.supersedes_id === row.id);
  const decidedCount = (id: string) => decisions.filter(row => belongsTo(row, id) && row.status === "decided").length;
  const sources = data.sources.filter(source => source.title.toLowerCase().includes(query.toLowerCase()));
  const visible = sources.filter(source => sourceId === "all" || source.id === sourceId);
  function record(previous: DemoDecision) {
    if (!outcome.trim() || !rationale.trim()) return;
    append({ id: crypto.randomUUID(), source_id: previous.source_id, source_ids: previous.source_ids, outcome: outcome.trim(), rationale: rationale.trim(), quote: previous.quote, status: "decided", supersedes_id: previous.id });
    setEditing(null); setNotice("새 결정을 결정 기록에 반영했습니다. 기존 미루기 기록은 이력으로 남습니다. 새로고침하면 체험이 초기화됩니다.");
  }
  return <section className="demo-document-workspace">
    <p className="demo-safe-banner">가상 회사 자료 · 변경은 현재 부서의 데모 화면에서만 유지되며 새로고침하면 초기화됩니다.</p>
    <div className="demo-source-controls">
      <label>문서·회의 검색<input value={query} onChange={event => { setQuery(event.target.value); setSourceId("all"); }} placeholder="자료 제목으로 검색" /></label>
      <label>문서·회의 선택<select value={sourceId} onChange={event => setSourceId(event.target.value)}><option value="all">모든 문서·회의</option>{sources.map(source => <option key={source.id} value={source.id}>{source.title} (결정 {decidedCount(source.id)} · 미루기 {decisions.filter(row => belongsTo(row, source.id) && isPending(row)).length})</option>)}</select></label>
    </div>
    {notice ? <p role="status" className="demo-safe-banner">{notice}</p> : null}
    {visible.length === 0 ? <p className="empty-state">조건에 맞는 자료가 없습니다.</p> : null}
    {visible.map(source => {
      const records = data.items.filter(item => item.source_id === source.id);
      const rows = decisions.filter(row => belongsTo(row, source.id));
      const summary = data.summaries[source.id];
      return <details className="panel demo-source" key={source.id} open={sourceId !== "all" || undefined}>
        <summary><strong>{source.title}</strong><span>{records.length}개 기록 · 결정 완료 {rows.filter(row => row.status === "decided").length}개 · 미루기 {rows.filter(isPending).length}개</span></summary>
        {!ledger ? summary ? <div className="demo-document-summary">
          <DocumentSummarySections summary={summary} />
          <section className="summary-section"><h4>원문 근거 <span className="count-label">{summary.citations.length}</span></h4><div className="document-citations">{summary.citations.map(citation => <blockquote key={`${citation.item_id}-${citation.quote}`}><q>{citation.quote}</q></blockquote>)}</div></section>
        </div> : <><h3>한눈에 보기</h3><p>원문 {records.length}개에서 결정과 후속 작업의 근거를 확인하세요.</p></> : null}
        <div className="demo-source-actions"><Link className="text-link" href={`/demo/d/${dept}/${ledger ? "documents" : "ledger"}?source=${encodeURIComponent(source.id)}`}>{ledger ? "문서 원문 보기" : "이 문서의 결정 기록 보기"} →</Link></div>
        {rows.length ? rows.map(row => <article className="ledger-entry" id={`source-${source.id}-decision-${row.id}`} key={row.id}>
          <span className={`badge ${row.status === "deferred" ? "badge-urgent" : "badge-green"}`}>{row.status === "deferred" ? decisions.some(next => next.supersedes_id === row.id) ? "미루기 이력 · 다음 결정 완료" : "미루기" : row.supersedes_id ? "다음 결정 완료" : "결정 완료"}</span>
          <h3>{row.outcome}</h3><p>{row.rationale}</p><blockquote className="ledger-citation"><q>{row.quote}</q></blockquote>
          {row.status === "deferred" && !decisions.some(next => next.supersedes_id === row.id) ? editing === row.id ? <form className="demo-simulator-form" onSubmit={event => { event.preventDefault(); record(row); }}>
            <label>결정 내용<input required maxLength={2000} value={outcome} onChange={event => setOutcome(event.target.value)} /></label>
            <label>결정 이유<textarea required maxLength={4000} value={rationale} onChange={event => setRationale(event.target.value)} /></label>
            <button className="button button-primary" disabled={!outcome.trim() || !rationale.trim()}>결정 기록에 반영</button><button type="button" onClick={() => setEditing(null)}>취소</button>
          </form> : <button className="button button-secondary button-small" onClick={() => { setEditing(row.id); setOutcome(""); setRationale(""); }}>미룬 안건 다시 결정</button> : null}
        </article>) : <p>이 자료에 연결된 확정 결정은 아직 없습니다. 원문에서 논의와 할 일을 확인하세요.</p>}
        <details className="demo-source-originals" open={!ledger}><summary>원문 기록 {records.length}개</summary><div className="document-citations">{records.map(item => <blockquote key={item.id}><span>{item.author ?? "기록"}</span><q>{item.content}</q></blockquote>)}</div></details>
      </details>;
    })}
    {added.filter(row => !data.sources.some(source => source.id === row.source_id)).map(row => <article className="ledger-entry" key={row.id}><span className="badge badge-green">체험에서 반영한 결정</span><h3>{row.outcome}</h3><p>{row.rationale}</p><q>{row.quote}</q></article>)}
  </section>;
}
