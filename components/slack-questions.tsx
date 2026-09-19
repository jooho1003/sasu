"use client";

import { LABELS } from "@/lib/labels";
import { useState } from "react";

type SlackQuestion = { id: string; question: string; status: string; delivery_state: string };
const states: Record<string,string> = LABELS.answerDelivery;

export default function SlackQuestions({ deptId, onSelect }: { deptId: string; onSelect: (id: string) => Promise<void> }) {
  const [rows, setRows] = useState<SlackQuestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const url = `/api/d/${encodeURIComponent(deptId)}/slack-questions`;
  const load = async () => {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "슬랙 질문을 불러오지 못했습니다.");
    setRows(body.questions);
  };
  const act = async (action: () => Promise<void>) => {
    setBusy(true); setError(null); setNotice(null);
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "요청을 완료하지 못했습니다."); }
    finally { setBusy(false); }
  };
  const retry = async (id: string) => {
    const response = await fetch(url, { method: "POST", signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/json" }, body: JSON.stringify({ answerId: id }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "다시 보내지 못했습니다.");
    await load(); setNotice("저장된 답변을 슬랙에 다시 보내고 있습니다. 잠시 후 새로고침해 주세요.");
  };
  return <section className="grid gap-3 panel p-5" aria-label="내 슬랙 질문">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="m-0 text-lg">내 슬랙 질문</h2><button type="button" className="button button-secondary" disabled={busy} onClick={() => void act(load)}>{busy ? "확인 중…" : rows === null ? "최근 질문 확인" : "새로고침"}</button></div>
    <p className="m-0 text-sm text-[var(--muted)]">슬랙에서 보낸 내 질문과 전송 상태를 확인하고, 저장된 답변을 다시 보낼 수 있습니다.</p>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {rows?.length === 0 && <p>이 부서에 보낸 슬랙 질문이 없습니다.</p>}
    {rows && <ul className="space-y-3">{rows.map(row => <li key={row.id} className="rounded-xl border p-3">
      <p className="break-words">{row.question}</p>
      <p className="text-sm text-[var(--muted)]">{row.status === "pending" ? "답변 생성 중" : states[row.delivery_state] ?? "전송 상태 확인 필요"}</p>
      <div className="flex flex-wrap gap-2"><button type="button" className="button button-secondary" disabled={busy} onClick={() => void act(() => onSelect(row.id))}>답변 보기</button>
        {row.delivery_state === "failed" && row.status !== "pending" && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void act(() => retry(row.id))}>슬랙에 다시 보내기</button>}
      </div>
    </li>)}</ul>}
  </section>;
}
