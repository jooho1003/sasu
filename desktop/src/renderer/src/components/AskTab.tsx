import { useEffect, useRef, useState } from "react";
import type { Answer } from "../../../shared/contracts";
import { message } from "../App";
import { Evidence } from "./Evidence";
export function AskTab({
  answer,
  onAnswer,
  onNotice,
  registerFocus,
}: {
  answer: Answer | null;
  onAnswer: (answer: Answer) => void;
  onNotice: (value: string) => void;
  registerFocus: (focus: () => void) => void;
}) {
  const [question, setQuestion] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    registerFocus(() => input.current?.focus());
  }, [registerFocus]);
  const send = async (): Promise<void> => {
    if (question.trim().length < 5) {
      onNotice("질문을 5자 이상 적어 주세요.");
      return;
    }
    try {
      const result = await window.sasu.ask.send(question.trim());
      setQuestion("");
      if ("queued" in result) {
        onNotice("연결되면 보낼게요.");
        return;
      }
      const poll = async (): Promise<void> => {
        const next = await window.sasu.answer.get(result.answer_id);
        onAnswer(next);
        if (next.status === "pending")
          window.setTimeout(() => void poll(), 2_000);
      };
      void poll();
    } catch (cause) {
      onNotice(message(cause));
    }
  };
  return (
    <>
      <h1>무엇이 궁금한가요?</h1>
      <textarea
        ref={input}
        value={question}
        maxLength={1000}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="질문을 적어 주세요."
      />
      <button onClick={() => void send()}>질문하기</button>
      {answer?.status === "pending" ? <p>답을 찾는 중입니다.</p> : null}
      {answer?.status === "refused" ? (
        <p className="notice">근거가 부족해 답하지 못했습니다.</p>
      ) : null}
      {answer?.status === "failed" ? (
        <p className="notice">
          답을 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.
        </p>
      ) : null}
      {answer?.citations.length ? <Evidence answer={answer} /> : null}
    </>
  );
}
