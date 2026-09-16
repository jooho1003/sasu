"use client";

import Link from "next/link";
import { useState } from "react";
import { BrandMark, Icon } from "@/components/ui/icon";

type DemoAnswer = {
  id: string;
  question_key: string;
  question: string;
  answer: string | null;
  generic_answer: string | null;
  status: "done" | "refused";
  refused: boolean;
  quotes: string[];
};

type ComparisonLink = { href: string; departmentName: string };

export function DemoQuestions({
  answers,
  initialQuestionKey,
  comparisonByQuestionKey,
}: {
  answers: DemoAnswer[];
  initialQuestionKey?: string;
  comparisonByQuestionKey: Record<string, ComparisonLink>;
}) {
  const initialAnswer =
    answers.find((answer) => answer.question_key === initialQuestionKey) ??
    answers[0];
  const [selectedId, setSelectedId] = useState(initialAnswer?.id ?? "");
  const [freeQuestion, setFreeQuestion] = useState("");
  const [previewMessage, setPreviewMessage] = useState("");
  const [voicePreview, setVoicePreview] = useState(false);
  const selected = answers.find((answer) => answer.id === selectedId);
  const selectedIndex = answers.findIndex((answer) => answer.id === selectedId);
  const suggested = answers.find(
    (answer) => answer.status === "done" && answer.quotes.length > 0,
  );
  if (!selected)
    return <p className="empty-state">아직 준비된 질문과 답변이 없습니다.</p>;

  const selectAt = (index: number) => {
    const next = answers[index];
    if (next) setSelectedId(next.id);
  };

  const previewAsk = () => {
    const terms = freeQuestion.trim().split(/\s+/u).filter((term) => term.length >= 2);
    const closest = answers.find((answer) =>
      terms.some((term) => answer.question.includes(term) || answer.answer?.includes(term)),
    ) ?? suggested ?? answers[0];
    if (!closest) return;
    setSelectedId(closest.id);
    setPreviewMessage(`실제 전송 없이 가장 가까운 준비 질문 “${closest.question}”의 답을 열었습니다.`);
  };

  return (
    <div className="ask-layout">
      <div className="question-picker">
        <div className="question-list-toolbar">
          <strong>추천 질문</strong>
          <span>
            {selectedIndex + 1}/{answers.length}
          </span>
          <button
            type="button"
            aria-label="이전 질문"
            disabled={selectedIndex <= 0}
            onClick={() => selectAt(selectedIndex - 1)}
          >
            이전
          </button>
          <button
            type="button"
            aria-label="다음 질문"
            disabled={selectedIndex >= answers.length - 1}
            onClick={() => selectAt(selectedIndex + 1)}
          >
            다음
          </button>
        </div>
        <div className="question-list" role="group" aria-label="준비된 질문 선택">
          <p>이 부서 추천 질문</p>
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
        <section className="demo-ask-preview" aria-labelledby="demo-free-ask-heading">
          <div>
            <strong id="demo-free-ask-heading">자유 질문·음성 입력 체험</strong>
            <span className="badge badge-neutral"><Icon name="lock" size={11} /> 전송 없음</span>
          </div>
          <textarea
            value={freeQuestion}
            onChange={(event) => setFreeQuestion(event.target.value)}
            placeholder="예: 외주사 B 견적은 어떻게 됐나요?"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={freeQuestion.trim().length < 2} onClick={previewAsk}>가까운 근거 답변 보기</button>
            <button
              type="button"
              aria-pressed={voicePreview}
              onClick={() => {
                setVoicePreview((current) => !current);
                if (!voicePreview) setPreviewMessage("음성 ASK의 녹음 상태를 미리 보는 중입니다. 마이크·음성은 서버로 전송되지 않습니다.");
                else setPreviewMessage("녹음 완료 미리보기입니다. 실제 전사 대신 준비 질문을 선택해 주세요.");
              }}
            >{voicePreview ? "■ 녹음 끝내기 체험" : "🎙 음성 질문 동작 보기"}</button>
          </div>
          {previewMessage ? <p role="status">{previewMessage}</p> : null}
        </section>
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
            <span
              className={`badge ${selected.refused ? "badge-urgent" : "badge-green"}`}
            >
              {selected.refused ? "근거 없음" : "부서 근거"}
            </span>
          </div>
          <p className="answer-copy">
            {selected.refused
              ? (selected.answer ?? "이 부서 기록에서는 답을 확인할 수 없습니다.")
              : selected.quotes.length > 0
                ? (selected.answer ?? "답변이 없습니다.")
                : "근거 검증을 통과하지 못해 답변을 표시하지 않습니다."}
          </p>
          {selected.refused && suggested && suggested.id !== selected.id ? (
            <button
              className="text-link answer-suggestion"
              type="button"
              onClick={() => setSelectedId(suggested.id)}
            >
              이 부서의 근거 있는 질문 보기 <Icon name="arrow" size={14} />
            </button>
          ) : null}
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
        {comparisonByQuestionKey[selected.question_key] ? (
          <Link
            className="answer-compare-link"
            href={comparisonByQuestionKey[selected.question_key].href}
          >
            {comparisonByQuestionKey[selected.question_key].departmentName}에게 같은 질문
            <Icon name="arrow" size={15} />
          </Link>
        ) : null}
        <section className="answer-comparison">
          <h3>범용 AI 답변 예시 · 사전 작성</h3>
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
