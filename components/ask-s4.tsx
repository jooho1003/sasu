"use client";

import { useEffect, useRef, useState } from "react";
import SlackQuestions from "@/components/slack-questions";

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
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "transcribing">("idle");
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordingChunks = useRef<Blob[]>([]);
  const requestVersion = useRef(0);

  useEffect(() => () => {
    requestVersion.current += 1;
    if (pollTimer.current !== null) clearInterval(pollTimer.current);
    if (voiceTimer.current !== null) clearTimeout(voiceTimer.current);
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
  }, []);

  const startVoice = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("이 브라우저에서는 음성 입력을 지원하지 않습니다. 질문을 직접 입력해주세요.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";
      const nextRecorder = new MediaRecorder(stream, { mimeType });
      recordingChunks.current = [];
      nextRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunks.current.push(event.data);
      };
      nextRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setVoiceState("transcribing");
        const blob = new Blob(recordingChunks.current, { type: nextRecorder.mimeType || "audio/webm" });
        const form = new FormData();
        const filename = blob.type.includes("mp4") ? "voice.mp4" : "voice.webm";
        form.set("file", new File([blob], filename, { type: blob.type || "audio/webm" }));
        void fetch(`/api/d/${encodeURIComponent(deptId)}/voice`, { method: "POST", body: form })
          .then(async (response) => {
            const body = (await response.json()) as { text?: string; error?: string };
            if (!response.ok || !body.text) throw new Error(body.error ?? "음성을 변환하지 못했습니다.");
            setQuestion(body.text);
            setVoiceState("idle");
          })
          .catch((voiceError) => {
            setVoiceState("idle");
            setError(voiceError instanceof Error ? voiceError.message : "음성을 변환하지 못했습니다.");
          });
      };
      nextRecorder.start();
      recorder.current = nextRecorder;
      setVoiceState("recording");
      voiceTimer.current = setTimeout(() => {
        if (nextRecorder.state === "recording") nextRecorder.stop();
      }, 60_000);
    } catch {
      setError("마이크 권한을 허용하지 못했습니다. 질문을 직접 입력해주세요.");
    }
  };

  const stopVoice = () => {
    if (voiceTimer.current !== null) clearTimeout(voiceTimer.current);
    voiceTimer.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorder.current = null;
  };

  const loadAnswer = async (answerId: string): Promise<AnswerState> => {
    const response = await fetch(
      `/api/d/${encodeURIComponent(deptId)}/answers/${encodeURIComponent(answerId)}`,
      { cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    const body = (await response.json()) as AnswerState & { error?: string; message?: string };
    if (!response.ok) throw new Error(body.message ?? body.error ?? "답변 상태를 확인하지 못했습니다.");
    return body;
  };

  const ask = async () => {
    if (question.trim().length < 5) {
      setError("질문을 5자 이상 입력해주세요.");
      return;
    }
    setBusy(true);
    const version = ++requestVersion.current;
    const startedAt = Date.now();
    let polling = false;
    setError(null);
    setAnswer(null);
    if (pollTimer.current !== null) clearInterval(pollTimer.current);
    try {
      const response = await fetch(`/api/d/${encodeURIComponent(deptId)}/ask`, {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const body = (await response.json()) as { answer_id?: string; error?: string; message?: string };
      if (version !== requestVersion.current) return;
      if (!response.ok || !body.answer_id) throw new Error(body.message ?? body.error ?? "질문을 저장하지 못했습니다.");

      const poll = async (): Promise<AnswerState | null> => {
        if (polling || version !== requestVersion.current) return null;
        if (Date.now() - startedAt >= 120_000) {
          if (pollTimer.current !== null) clearInterval(pollTimer.current);
          pollTimer.current = null;
          setBusy(false);
          setAnswer(null);
          setError("답변 확인이 지연되고 있습니다. 잠시 후 다시 질문해 주세요.");
          return null;
        }
        polling = true;
        try {
          const next = await loadAnswer(body.answer_id as string);
          if (version !== requestVersion.current) return null;
          setAnswer(next);
          if (next.status !== "pending") {
            if (pollTimer.current !== null) clearInterval(pollTimer.current);
            pollTimer.current = null;
            setBusy(false);
          }
          return next;
        } catch (pollError) {
          if (version !== requestVersion.current) return null;
          if (pollTimer.current !== null) clearInterval(pollTimer.current);
          pollTimer.current = null;
          setBusy(false);
          setError(pollError instanceof Error ? pollError.message : "답변을 불러오지 못했습니다.");
          return null;
        } finally {
          polling = false;
        }
      };
      const first = await poll();
      if (first?.status === "pending") {
        pollTimer.current = setInterval(() => void poll(), 2_000);
      }
    } catch (askError) {
      if (version !== requestVersion.current) return;
      setBusy(false);
      setError(askError instanceof Error ? askError.message : "질문을 보내지 못했습니다.");
    }
  };

  return (
    <main className="workspace-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <p className="m-0 text-sm font-bold text-[var(--accent)]">사수</p>
          <h1 className="m-0 text-3xl">사수에게 묻기</h1>
          <p className="m-0 text-[var(--muted)]">내 권한 범위 안의 부서 기록만 근거로 답합니다.</p>
        </div>

      </header>

      <section className="grid gap-4 panel p-5">
        <label className="grid gap-2 font-bold" htmlFor="ask-question">
          무엇이 궁금한가요?
          <textarea
            id="ask-question"
            className="min-h-40 rounded-xl border border-black/10 bg-[#fafbf9] p-4 leading-7 font-normal text-[var(--ink)]"
            maxLength={1_000}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="예: 외주사 B 견적은 어떻게 결정됐나요?"
            value={question}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className={`rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-50 ${voiceState === "recording" ? "border-[var(--urgent)] text-[var(--urgent)]" : "border-[var(--accent)] text-[var(--accent)]"}`}
            disabled={busy || voiceState === "transcribing"}
            onClick={() => voiceState === "recording" ? stopVoice() : void startVoice()}
            type="button"
          >
            {voiceState === "recording" ? "■ 녹음 끝내기" : voiceState === "transcribing" ? "음성 변환 중…" : "🎙 음성으로 입력"}
          </button>
          <span className="text-sm text-[var(--muted)]">최대 60초 · 원본 음성은 저장하지 않습니다.</span>
        </div>
        <button
          className="button button-primary w-fit disabled:opacity-50"
          disabled={busy}
          onClick={() => void ask()}
          type="button"
        >
          {busy ? "기록을 찾는 중…" : "묻기"}
        </button>
        {error ? <p aria-live="assertive" className="m-0 text-sm font-bold text-red-700">{error}</p> : null}
      </section>

      <SlackQuestions deptId={deptId} onSelect={async id => {
        const version = ++requestVersion.current;
        if (pollTimer.current !== null) clearInterval(pollTimer.current);
        pollTimer.current = null;
        setBusy(false);
        setError(null);
        setAnswer(null);
        const next = await loadAnswer(id);
        if (version === requestVersion.current) setAnswer(next);
      }} />

      {answer?.status === "pending" ? (
        <div className="rounded-2xl bg-[var(--surface)] p-6 text-[var(--muted)]">부서 기록을 확인하고 있습니다.</div>
      ) : null}
      {answer?.status === "failed" ? (
        <div className="rounded-2xl bg-[var(--surface)] p-6">답변을 만들지 못했습니다. 잠시 후 다시 질문해주세요.</div>
      ) : null}
      {answer?.status === "done" && answer.citations.length === 0 ? <p role="status">현재 확인할 수 있는 근거로 답변을 표시할 수 없습니다. 다시 질문해 주세요.</p> : null}
      {answer && (answer.status === "refused" || (answer.status === "done" && answer.citations.length > 0)) ? (
        <article className="grid gap-5 panel p-6">
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
