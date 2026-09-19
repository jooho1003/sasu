"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { closestDemoAnswer } from "@/lib/demo-workspace";
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
  const [noMatch, setNoMatch] = useState(false);
  const answerPanel = useRef<HTMLElement>(null);
  const revealAnswer = () => requestAnimationFrame(() => { answerPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" }); answerPanel.current?.focus({ preventScroll: true }); });
  const selected = answers.find((answer) => answer.id === selectedId);
  const selectedIndex = answers.findIndex((answer) => answer.id === selectedId);
  const suggested = answers.find(
    (answer) => answer.status === "done" && answer.quotes.length > 0,
  );
  if (!selected)
    return <p className="empty-state">아직 준비된 질문과 답변이 없습니다.</p>;

  const selectAt = (index: number) => {
    const next = answers[index];
    if (next) { setSelectedId(next.id); setNoMatch(false); }
  };

  const previewAsk = () => {
    const closest = closestDemoAnswer(freeQuestion, answers);
    if (!closest) { setNoMatch(true); setPreviewMessage("이 질문에 맞는 준비된 근거 답변이 없습니다. 추천 질문을 선택해 주세요."); revealAnswer(); return; }
    setNoMatch(false);
    setSelectedId(closest.id);
    setPreviewMessage(`실제 전송 없이 가장 가까운 준비 질문 “${closest.question}”의 답을 열었습니다.`);
    revealAnswer();
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
              onClick={() => { setSelectedId(answer.id); setNoMatch(false); setPreviewMessage(""); revealAnswer(); }}
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
            aria-label="데모 질문"
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
                if (!voicePreview) setPreviewMessage("샘플 음성 입력 체험 중입니다. 마이크·음성은 서버로 전송되지 않습니다.");
                else { setFreeQuestion(suggested?.question ?? selected.question); setPreviewMessage("예시 음성을 글로 바꿈: 질문 입력창에 반영했습니다. 가까운 근거 답변 보기를 눌러 확인하세요."); }
              }}
            >{voicePreview ? "■ 녹음 끝내기 체험" : "🎙 음성 질문 동작 보기"}</button>
          </div>
          {voicePreview ? <div className="demo-voice-state" role="status"><span className="status-dot" /> 샘플 음성 입력 중 · 실제 녹음 아님<p>“{suggested?.question ?? selected.question}”</p><p>녹음 끝내기 체험을 누르면 샘플 받아쓴 글이 입력됩니다.</p></div> : null}
          {previewMessage ? <p role="status">{previewMessage}</p> : null}
        </section>
      </div>
      <article
        className="answer-panel"
        id="demo-answer"
        ref={answerPanel}
        tabIndex={-1}
        aria-live="polite"
        aria-atomic="true"
      >
        <h2>{noMatch ? freeQuestion : selected.question}</h2>
        {noMatch ? <p role="status">이 부서의 준비된 자료에서 답을 찾지 못했습니다. 추천 질문으로 근거 있는 답변을 확인하세요.</p> : <>
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
              답변의 근거 · 원문 그대로 {index + 1}
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
          <h3>범용 인공지능 답변 예시 · 사전 작성</h3>
          <p>{selected.generic_answer ?? "준비된 범용 답변이 없습니다."}</p>
        </section>
        <div className="answer-footer">
          <Icon name="lock" size={13} />이 부서의 기록만 참고한, 미리 준비된
          답변입니다.
        </div>
        </>}
      </article>
    </div>
  );
}
