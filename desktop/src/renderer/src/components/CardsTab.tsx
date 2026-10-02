// Design Ref: desktop-decision-flow §5 — open current details once and discard departed-screen callbacks.
import { useEffect, useRef, useState } from "react";
import type { CompanionInbox } from "@sasu/contracts";
import type { Card } from "../../../shared/contracts";
import { message } from "../../../shared/messages";
import { CardView } from "./CardView";
export function CardsTab({
  card,
  inbox,
  loading,
  error,
  role,
  onCard,
  onSeen,
  onNotice,
  onChanged,
  onProcessed,
}: {
  card: Card | null;
  inbox: CompanionInbox | null;
  loading: boolean;
  error: string;
  role: "lead" | "member";
  onCard: (card: Card | null) => void;
  onSeen: (id: string, stillCurrent?: () => boolean) => Promise<void>;
  onNotice: (value: string) => void;
  onChanged: () => void;
  onProcessed: () => void;
}) {
  const generation = useRef(0);
  const locked = useRef(false);
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => () => { generation.current += 1; }, []);
  const back = (): void => {
    generation.current += 1;
    locked.current = false;
    setOpening(null);
    onCard(null);
  };
  const open = async (id: string): Promise<void> => {
    if (locked.current || loading) return;
    locked.current = true;
    const version = ++generation.current;
    const current = (): boolean => version === generation.current;
    setOpening(id);
    onNotice("");
    try {
      const next = await window.sasu.card.get(id);
      if (!current()) return;
      onCard(next);
      if (next.citations.length) await onSeen(id, current);
    } catch (cause) {
      if (current()) onNotice(message(cause));
    } finally {
      if (current()) { locked.current = false; setOpening(null); }
    }
  };
  if (card)
    return (
      <CardView
        key={card.card.id}
        card={card}
        canDecide={role === "lead" || card.card.status === "open"}
        onBack={back}
        onChanged={() => { back(); onProcessed(); }}
        onNotice={onNotice}
      />
    );
  return (
    <>
      <h1>결정할 카드</h1>
      <button disabled={loading || opening !== null} onClick={() => { onNotice(""); onChanged(); }}>카드 새로고침</button>
      {loading ? <p role="status">카드를 불러오는 중입니다.</p> : null}
      {opening ? <p role="status">카드 내용을 불러오는 중입니다.</p> : null}
      {error ? <p role="alert">{error} 카드 새로고침을 눌러 다시 시도해 주세요.</p> : null}
      {!error ? (inbox?.cards ?? []).map((entry) => (
        <button
          className="row"
          key={entry.id}
          disabled={loading || opening !== null}
          onClick={() => void open(entry.id)}
        >
          {entry.title}
          <small>{entry.status === "needs_review" ? "검토 필요" : "결정 대기"}</small>
          <small>{entry.deadline ?? "마감 미정"}</small>
        </button>
      )) : null}
      {!loading && !error && !inbox?.cards.length ? <p>지금 결정할 카드가 없습니다.</p> : null}
    </>
  );
}
