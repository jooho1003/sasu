import type { Questions } from "../../../shared/contracts";
import { message } from "../App";
export function HistoryTab({
  entries,
  next,
  onEntries,
  onNext,
  onOpen,
  onNotice,
}: {
  entries: Questions["questions"];
  next: Questions["next"];
  onEntries: (entries: Questions["questions"]) => void;
  onNext: (next: Questions["next"]) => void;
  onOpen: (answer: Awaited<ReturnType<typeof window.sasu.answer.get>>) => void;
  onNotice: (value: string) => void;
}) {
  const load = async (cursor: Questions["next"]): Promise<void> => {
    try {
      const result = await window.sasu.questions.list(cursor);
      onEntries(cursor ? [...entries, ...result.questions] : result.questions);
      onNext(result.next);
    } catch (cause) {
      onNotice(message(cause));
    }
  };
  return (
    <>
      <h1>지난 질문</h1>
      <button onClick={() => void load(null)}>기록 불러오기</button>
      {entries.map((entry) => (
        <button
          className="row"
          key={entry.id}
          onClick={() =>
            void window.sasu.answer
              .get(entry.id)
              .then(onOpen)
              .catch((cause) => onNotice(message(cause)))
          }
        >
          <span>{entry.question}</span>
          <small>
            {new Date(entry.created_at).toLocaleDateString("ko-KR")} ·{" "}
            {entry.status}
          </small>
        </button>
      ))}
      {next ? <button onClick={() => void load(next)}>더 보기</button> : null}
    </>
  );
}
