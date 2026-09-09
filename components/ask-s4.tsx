"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Citation = {
  quote: string;
  author: string;
  source: string;
  href: string;
};

type AnswerState = {
  id: string;
  status: "pending" | "done" | "refused" | "failed";
  answer: string | null;
  refused: boolean;
  citations: Citation[];
};

export default function AskS4({ deptId }: { deptId: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AnswerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (pollTimer.current !== null) clearInterval(pollTimer.current);
  }, []);

  const loadAnswer = async (answerId: string): Promise<AnswerState> => {
    const response = await fetch(
      `/api/d/${encodeURIComponent(deptId)}/answers/${encodeURIComponent(answerId)}`,
      { cache: "no-store" },
    );
    const body = (await response.json()) as AnswerState & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "답변 상태를 확인하지 못했습니다.");
    return body;
  };

  const ask = async () => {
    if (question.trim().length < 5) {
      setError("질문을 5자 이상 입력해주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    setAnswer(null);
    if (pollTimer.current !== null) clearInterval(pollTimer.current);
    try {
      const response = await fetch(`/api/d/${encodeURIComponent(deptId)}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const body = (await response.json()) as { answer_id?: string; error?: string };
      if (!response.ok || !body.answer_id) throw new Error(body.error ?? "질문을 저장하지 못했습니다.");

      const poll = async (): Promise<AnswerState | null> => {
        try {
          const next = await loadAnswer(body.answer_id as string);
          setAnswer(next);
          if (next.status !== "pending") {
            if (pollTimer.current !== null) clearInterval(pollTimer.current);
            pollTimer.current = null;
            setBusy(false);
          }
          return next;
        } catch (pollError) {
          if (pollTimer.current !== null) clearInterval(pollTimer.current);
          pollTimer.current = null;
          setBusy(false);
          setError(pollError instanceof Error ? pollError.message : "답변을 불러오지 못했습니다.");
          return null;
        }
      };
      const first = await poll();
      if (first?.status === "pending") {
        pollTimer.current = setInterval(() => void poll(), 2_000);
      }
    } catch (askError) {
      setBusy(false);
      setError(askError instanceof Error ? askError.message : "질문을 보내지 못했습니다.");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-7 px-5 py-10 text-left sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <p className="m-0 text-sm font-bold text-[var(--accent)]">사수</p>
          <h1 className="text-4xl! text-[var(--ink)]!">묻기</h1>
          <p className="m-0 text-[var(--muted)]">내 권한 범위 안의 부서 기록만 근거로 답합니다.</p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link href={`/d/${deptId}`}>대시보드</Link>
          <Link href={`/d/${deptId}/ledger`}>원장</Link>
        </div>
      </header>

      <section className="grid gap-4 rounded-2xl bg-[var(--surface)] p-5 shadow-sm">
        <label className="grid gap-2 font-bold" htmlFor="ask-question">
          무엇이 궁금한가요?
          <textarea
            id="ask-question"
            className="min-h-32 rounded-xl border border-black/15 bg-[var(--surface)] p-3 font-normal text-[var(--ink)]"
            maxLength={1_000}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="예: 외주사 B 견적은 어떻게 결정됐나요?"
            value={question}
          />
        </label>
        <button
          className="w-fit rounded-lg bg-[var(--accent)] px-5 py-3 font-bold text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void ask()}
          type="button"
        >
          {busy ? "기록을 찾는 중…" : "묻기"}
        </button>
        {error ? <p aria-live="assertive" className="m-0 text-sm font-bold text-red-700">{error}</p> : null}
      </section>

      {answer?.status === "pending" ? (
        <div className="rounded-2xl bg-[var(--surface)] p-6 text-[var(--muted)]">부서 기록을 확인하고 있습니다.</div>
      ) : null}
      {answer?.status === "failed" ? (
        <div className="rounded-2xl bg-[var(--surface)] p-6">답변을 만들지 못했습니다. 잠시 후 다시 질문해주세요.</div>
      ) : null}
      {answer && (answer.status === "done" || answer.status === "refused") ? (
        <article className="grid gap-5 rounded-2xl bg-[var(--surface)] p-6 shadow-sm">
          <p className="m-0 whitespace-pre-wrap leading-8">{answer.answer}</p>
          {answer.citations.length > 0 ? (
            <section className="grid gap-3">
              <h2 className="m-0 text-xl">근거</h2>
              {answer.citations.map((citation, index) => (
                <a key={`${citation.href}-${index}`} className="grid gap-1 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4 no-underline" href={citation.href}>
                  <span className="text-xs text-[var(--muted)]" data-meta>{citation.author} · {citation.source}</span>
                  <q className="font-normal leading-7 text-[var(--ink)]">{citation.quote}</q>
                </a>
              ))}
            </section>
          ) : null}
          <p className="m-0 text-sm text-[var(--muted)]">내 권한 범위 안의 부서 기록만 참고했습니다.</p>
          {answer.refused ? <p className="m-0 text-sm font-bold text-[var(--urgent)]">근거가 부족하면 결정 카드로 승격해 담당자에게 물어볼 수 있습니다.</p> : null}
        </article>
      ) : null}
    </main>
  );
}
