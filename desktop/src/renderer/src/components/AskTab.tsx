import { useEffect, useRef, useState } from "react";
import type { Answer } from "../../../shared/contracts";
import { message } from "../App";
import { Evidence } from "./Evidence";
import { startAnswerPolling } from "../../../main/core/poller";
export function AskTab({
  answer,
  answerQuestion,
  onQuestion,
  onAnswer,
  onNotice,
  registerFocus,
}: {
  answer: Answer | null;
  answerQuestion: string;
  onQuestion: (question: string) => void;
  onAnswer: (answer: Answer | null) => void;
  onNotice: (value: string) => void;
  registerFocus: (focus: () => void) => void;
}) {
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [parent, setParent] = useState<{ id: string; question: string } | null>(null);
  const [pollingStopped, setPollingStopped] = useState(answer?.status === "pending");
  const requestVersion = useRef(0);
  const cancelPoll = useRef<(() => void) | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => {
    requestVersion.current += 1;
    cancelPoll.current?.();
  }, []);
  useEffect(() => {
    registerFocus(() => input.current?.focus());
  }, [registerFocus]);
  const send = async (): Promise<void> => {
    if (sendingRef.current) return;
    if (question.trim().length < 5) {
      onNotice("질문을 5자 이상 적어 주세요.");
      return;
    }
    const version = ++requestVersion.current;
    sendingRef.current = true;
    cancelPoll.current?.();
    setSending(true);
    setPollingStopped(answer?.status === "pending");
    onNotice("");
    try {
      const submitted = question.trim();
      const result = await window.sasu.ask.send(submitted, parent?.id ?? null);
      if (version !== requestVersion.current) return;
      setQuestion("");
      setParent(null);
      if ("queued" in result) {
        onAnswer(null);
        onQuestion("");
        onNotice("연결되면 보낼게요.");
        return;
      }
      onQuestion(submitted);
      setPollingStopped(false);
      onAnswer({ id: result.answer_id, status: "pending", answer: null, refused: false, citations: [] });
      cancelPoll.current = startAnswerPolling({
        getAnswer: () => window.sasu.answer.get(result.answer_id),
        onAnswer,
        onError: (cause) => {
          setPollingStopped(true);
          onNotice(`${message(cause)} 잠시 뒤 기록에서 답을 다시 확인해 주세요.`);
        },
        onTimeout: () => {
          setPollingStopped(true);
          onNotice("답을 기다리는 시간이 지났습니다. 잠시 뒤 기록에서 다시 확인하세요.");
        },
      });
    } catch (cause) {
      if (version === requestVersion.current) onNotice(message(cause));
    } finally {
      if (version === requestVersion.current) { sendingRef.current = false; setSending(false); }
    }
  };
  return (
    <>
      <h1>무엇이 궁금한가요?</h1>
      {parent ? (
        <aside className="workSection" aria-label="이어 묻는 질문">
          <strong>이 질문에 이어 묻습니다.</strong>
          <p>{parent.question}</p>
        </aside>
      ) : null}
      <textarea
        ref={input}
        aria-label="질문 내용"
        value={question}
        maxLength={1000}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="질문을 적어 주세요."
      />
      <button disabled={sending} onClick={() => void send()}>질문하기</button>
      {answer || parent ? <button disabled={sending} onClick={() => {
        if (sendingRef.current) return;
        requestVersion.current += 1;
        cancelPoll.current?.();
        setParent(null);
        setPollingStopped(false);
        onAnswer(null);
        onQuestion("");
        onNotice("");
        input.current?.focus();
      }}>새 질문으로 시작</button> : null}
      {answer && answerQuestion && !parent ? <p>{answerQuestion}</p> : null}
      {answer?.status === "pending" ? <p>{pollingStopped ? "답 확인을 멈췄습니다. 기록에서 다시 확인해 주세요." : "답을 찾는 중입니다."}</p> : null}
      {answer?.status === "refused" ? (
        <p className="notice">근거가 부족해 답하지 못했습니다.</p>
      ) : null}
      {answer?.status === "failed" ? (
        <p className="notice">
          답을 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.
        </p>
      ) : null}
      {answer?.citations.length ? <Evidence answer={answer} /> : null}
      {!parent && (answer?.status === "done" || answer?.status === "refused") ? (
        <button disabled={sending} onClick={() => {
          if (sendingRef.current) return;
          setParent({ id: answer.id, question: answerQuestion });
          onNotice("");
          input.current?.focus();
        }}>이어 묻기</button>
      ) : null}
    </>
  );
}
