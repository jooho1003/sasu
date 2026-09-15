"use client";

import { useState } from "react";
import { BrandMark, Icon } from "@/components/ui/icon";

type DemoAnswer = {
  id: string;
  question: string;
  answer: string | null;
  generic_answer: string | null;
  quotes: string[];
};

export function DemoQuestions({ answers }: { answers: DemoAnswer[] }) {
  const [selectedId, setSelectedId] = useState(answers[0]?.id ?? "");
  const selected = answers.find((answer) => answer.id === selectedId);
  if (!selected)
    return <p className="empty-state">아직 준비된 질문과 답변이 없습니다.</p>;

  return (
    <div className="ask-layout">
      <div className="question-list" role="group" aria-label="준비된 질문 선택">
        <p>이런 질문을 해보세요</p>
        {answers.map((answer) => (
          <button
            type="button"
            key={answer.id}
            aria-pressed={selectedId === answer.id}
            aria-controls="demo-answer"
            onClick={() => setSelectedId(answer.id)}
          >
            <span>{answer.question}</span>
            <Icon name="chevron" size={14} />
          </button>
        ))}
      </div>
      <article
        className="answer-panel"
        id="demo-answer"
        aria-live="polite"
        aria-atomic="true"
      >
        <h2>{selected.question}</h2>
        <section>
          <div className="answer-identity">
            <BrandMark small />
            <strong>사수의 답</strong>
            <span className="badge badge-green">부서 근거</span>
          </div>
          <p className="answer-copy">
            {selected.quotes.length > 0
              ? (selected.answer ?? "답변이 없습니다.")
              : "확인할 근거가 충분하지 않아 답변할 수 없습니다."}
          </p>
        </section>
        {selected.quotes.map((quote, index) => (
          <div className="citation-block" key={`${selected.id}-${index}`}>
            <span>
              <Icon name="file" size={13} />
              답변의 근거 · 원문 인용 {index + 1}
            </span>
            <q>{quote}</q>
          </div>
        ))}
        <section className="answer-comparison">
          <h3>범용 AI의 답과 비교해보세요</h3>
          <p>{selected.generic_answer ?? "준비된 범용 답변이 없습니다."}</p>
        </section>
        <div className="answer-footer">
          <Icon name="lock" size={13} />이 부서의 기록만 참고한, 미리 준비된
          답변입니다.
        </div>
      </article>
    </div>
  );
}
