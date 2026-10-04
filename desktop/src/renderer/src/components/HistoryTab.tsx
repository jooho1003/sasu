import { useCallback, useEffect, useRef, useState } from "react";
import type { Answer, Questions } from "../../../shared/contracts";
import { message } from "../App";

const STATUS: Record<string, string> = {
  pending: "답을 찾는 중", done: "답변 완료", refused: "근거 부족", failed: "답변 실패",
};

export function HistoryTab({ onOpen, onNotice }: {
  onOpen: (answer: Answer, question: string) => void;
  onNotice: (value: string) => void;
}) {
  // Re-read the current session on every mount; no persistent history cache.
  const [entries, setEntries] = useState<Questions["questions"]>([]);
  const [next, setNext] = useState<Questions["next"]>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [opening, setOpening] = useState<string | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async (cursor: Questions["next"]): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    const version = ++generation.current;
    setState("loading");
    onNotice("");
    if (!cursor) { setEntries([]); setNext(null); }
    try {
      const result = await window.sasu.questions.list(cursor);
      if (version !== generation.current) return;
      setEntries((current) => cursor
        ? Array.from(new Map([...current, ...result.questions].map((entry) => [entry.id, entry])).values())
        : result.questions);
      setNext(result.next);
      setState("ready");
    } catch (cause) {
      if (version !== generation.current) return;
      setState("error");
      onNotice(message(cause));
    } finally {
      if (version === generation.current) busy.current = false;
    }
  }, [onNotice]);
  useEffect(() => {
    void load(null);
    return () => { generation.current += 1; busy.current = false; };
  }, [load]);

  const open = async (entry: Questions["questions"][number]): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    const version = ++generation.current;
    setOpening(entry.id);
    onNotice("");
    try {
      const answer = await window.sasu.answer.get(entry.id);
      if (version === generation.current) onOpen(answer, entry.question);
    } catch (cause) {
      if (version === generation.current) onNotice(message(cause));
    } finally {
      if (version === generation.current) { busy.current = false; setOpening(null); }
    }
  };
  const disabled = state === "loading" || opening !== null;
  return (
    <>
      <h1>지난 질문</h1>
      <button disabled={disabled} onClick={() => void load(null)}>기록 불러오기</button>
      {state === "loading" ? <p role="status">질문 기록을 불러오는 중입니다.</p> : null}
      {state === "ready" && !entries.length ? <p>아직 질문 기록이 없습니다.</p> : null}
      {state === "error" ? <p>기록 불러오기를 눌러 다시 시도해 주세요.</p> : null}
      {entries.map((entry) => (
        <button className="row" key={entry.id} disabled={disabled} onClick={() => void open(entry)}>
          <span>{entry.question}</span>
          <small>
            {new Date(entry.created_at).toLocaleDateString("ko-KR")} · {STATUS[entry.status] ?? "상태 확인 필요"}
            {entry.parent_id ? " · 이어 묻기" : ""}
            {opening === entry.id ? " · 답을 여는 중" : ""}
          </small>
        </button>
      ))}
      {next ? <button disabled={disabled} onClick={() => void load(next)}>더 보기</button> : null}
    </>
  );
}
