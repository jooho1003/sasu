"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

export function DemoTrailerInvites({ dept }: { dept: string }) {
  const [issued, setIssued] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  return <section className="grid gap-4 rounded-2xl border border-ink/10 bg-surface p-5" aria-label="지원자 링크 발급 체험">
    <h2 className="m-0 text-xl">지원자 링크 발급 체험</h2>
    <p className="m-0 text-sm text-muted">눌러 볼 수 있음 · 가상 지원자만 사용하며 변경은 브라우저 메모리에만 남습니다. 새로고침하면 초기화됩니다.</p>
    {["A", "B", "C"].map((candidate) => {
      const path = `/demo/d/${dept}/trailers?candidate=${candidate}`;
      return <div key={candidate} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink/10 p-3" aria-label={`가상 지원자 ${candidate}`}>
        <span>가상 지원자 {candidate} · candidate-{candidate.toLowerCase()}@example.com</span>
        {!issued.includes(candidate) ? <button type="button" className="rounded-lg border px-3 py-2" onClick={() => setIssued([...issued, candidate])}>링크 만들기</button> : <>
          <Link className="break-all text-accent underline" href={path}>{path}</Link>
          <button type="button" className="rounded-lg border px-3 py-2" onClick={() => void navigator.clipboard.writeText(`${location.origin}${path}`).then(() => setMessage("링크를 복사했습니다.")).catch(() => setMessage("링크를 직접 복사해 주세요."))}>복사</button>
        </>}
      </div>;
    })}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}

export function DemoCandidateConsent({ candidate, children }: { candidate: string | null; children: ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [continued, setContinued] = useState(false);
  if (!candidate) return children;
  return <section className="grid gap-5">
    <p className="rounded-xl bg-accent/10 p-4">가상 지원자 {candidate}의 링크로 들어온 화면입니다. 실제 지원자 링크는 이메일 확인과 동의 뒤에 열립니다.</p>
    {continued ? children : <div className="grid gap-4 rounded-2xl border border-ink/10 p-5">
      <h2 className="m-0 text-xl">개인정보 수집·이용 동의 화면 체험</h2>
      <p className="m-0">실제 지원자는 이메일과 결정·이유·단서 기록의 수집에 동의한 뒤 과제를 제출합니다. 이 화면은 합성 체험이며 동의와 입력을 서버에 보내지 않습니다.</p>
      <label className="flex items-center gap-3"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />합성 동의 화면을 확인했습니다.</label>
      <button type="button" className="w-fit rounded-xl bg-accent px-5 py-3 text-white disabled:opacity-50" disabled={!checked} onClick={() => setContinued(true)}>계속</button>
    </div>}
  </section>;
}
