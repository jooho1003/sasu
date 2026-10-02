import type { Answer } from "../../../shared/contracts";
export function Evidence({ answer }: { answer: Answer }) {
  if (!answer.citations.length) return null;
  return (
    <section className="evidence" aria-label="근거가 된 원문">
      {answer.answer ? <p className="answerBody">{answer.answer}</p> : null}
      {answer.citations.map((citation, index) => (
        <article key={`${citation.href}-${index}`}>
          <q>{citation.quote}</q>
          <small>
            {citation.source} · {citation.author}
          </small>
          <button onClick={() => void window.sasu.app.openWeb(citation.href)}>
            웹에서 원문 보기
          </button>
        </article>
      ))}
    </section>
  );
}
