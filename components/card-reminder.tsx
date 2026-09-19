"use client";

import { LABELS } from "@/lib/labels";
import { useEffect, useState } from "react";

type Reminder = { id: string; kind: string; state: string; scheduled_for: string };
const labels: Record<string,string> = LABELS.reminderState;

export function CardReminder({ deptId, cardId }: { deptId: string; cardId: string }) {
  const [rows, setRows] = useState<Reminder[] | null>(null);
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const endpoint = `/api/d/${encodeURIComponent(deptId)}/cards/${encodeURIComponent(cardId)}/reminder`;
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        const body = await response.json() as { reminders?: Reminder[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "알림을 불러오지 못했습니다.");
        if (!controller.signal.aborted) { setRows(body.reminders ?? []); setError(null); }
      } catch { if (!controller.signal.aborted) setError("알림을 불러오지 못했습니다."); }
    })();
    return () => controller.abort();
  }, [endpoint, revision]);
  async function save(cancel: boolean) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const scheduled = cancel ? null : new Date(`${at}:00+09:00`).toISOString();
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scheduled_for: scheduled }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "알림을 저장하지 못했습니다.");
      setRevision(v => v + 1);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "알림을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <section className="mt-6 grid gap-3 border-t border-black/10 pt-5" aria-label="담당 결정 알림">
    <h2 className="m-0 text-lg">다시 확인할 시간</h2>
    <p className="m-0 text-sm text-[var(--muted)]">담당자에게 슬랙 개인 메시지으로 알려드립니다. 미완료 결정은 마감 후에도 한 번 알립니다.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void save(false); }}>
      <label className="grid gap-1 text-sm font-bold">알림 시각 (한국 시간)
        <input className="rounded-lg border border-black/15 p-2 font-normal" required type="datetime-local" value={at} onChange={e => setAt(e.target.value)} disabled={busy} />
      </label>
      <button className="rounded-lg bg-[var(--accent)] px-4 py-2 font-bold text-white disabled:opacity-50" disabled={busy || !at} type="submit">{busy ? "저장 중…" : "알림 예약"}</button>
      {rows?.some(r => r.kind === "manual" && ["pending", "queued", "sending"].includes(r.state)) ? <button className="rounded-lg border border-black/15 px-4 py-2" type="button" disabled={busy} onClick={() => void save(true)}>예약 취소</button> : null}
    </form>
    {rows?.map(row => <p className="m-0 text-sm" key={row.id}>{row.kind === "deadline" ? "마감 알림" : "예약 알림"} · {new Date(row.scheduled_for).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · {labels[row.state] ?? "상태 확인 중"}</p>)}
    {error ? <div role="alert" className="text-sm">{error} <button type="button" onClick={() => setRevision(v => v + 1)}>다시 불러오기</button></div> : null}
  </section>;
}
