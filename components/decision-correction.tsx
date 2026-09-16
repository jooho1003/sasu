"use client";

import { useRef, useState } from "react";

export function DecisionCorrection({ deptId, previousId, initialOutcome, onDone }: {
  deptId: string; previousId: string; initialOutcome: string; onDone: () => void;
}) {
  const [outcome, setOutcome] = useState(initialOutcome);
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submission = useRef<{ content: string; id: string } | null>(null);
  return <details className="mt-5 border-t border-black/10 pt-4">
    <summary className="cursor-pointer font-bold text-[var(--accent)]">결정 정정</summary>
    <form className="mt-4 grid gap-3" onSubmit={async (event) => {
      event.preventDefault();
      if (busy) return;
      const content = JSON.stringify([outcome.trim(), rationale.trim()]);
      if (submission.current?.content !== content) submission.current = { content, id: crypto.randomUUID() };
      setBusy(true); setError(null);
      try {
        const response = await fetch(`/api/d/${encodeURIComponent(deptId)}/decisions/correct`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ previous_id: previousId, correction_id: submission.current.id, outcome, rationale }),
        });
        const body = await response.json() as { error?: string };
        if (!response.ok) throw new Error(body.error ?? "정정하지 못했습니다.");
        onDone();
      } catch (caught) { setError(caught instanceof Error ? caught.message : "정정하지 못했습니다."); }
      finally { setBusy(false); }
    }}>
      <p className="m-0 text-sm text-[var(--muted)]">이전 결정과 근거는 정정 이력에 남습니다.</p>
      <label className="grid gap-1 font-bold">정정한 결정 결과
        <input className="rounded-lg border border-black/15 p-3 font-normal" required maxLength={300} disabled={busy} value={outcome} onChange={e => setOutcome(e.target.value)} />
      </label>
      <label className="grid gap-1 font-bold">정정 사유
        <textarea className="min-h-24 rounded-lg border border-black/15 p-3 font-normal" required maxLength={1000} disabled={busy} value={rationale} onChange={e => setRationale(e.target.value)} />
      </label>
      <button className="w-fit rounded-lg bg-[var(--accent)] px-4 py-2 font-bold text-white disabled:opacity-50" disabled={busy || !outcome.trim() || !rationale.trim()} type="submit">{busy ? "정정 중…" : "정정 기록 남기기"}</button>
      {error ? <p role="alert" className="m-0 text-sm">{error}</p> : null}
    </form>
  </details>;
}
