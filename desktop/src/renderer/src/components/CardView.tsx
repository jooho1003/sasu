// Design Ref: desktop-decision-flow §5 — a successful server action returns to the current inbox.
import { useEffect, useRef, useState } from "react";
import type { Card } from "../../../shared/contracts";
import { message } from "../../../shared/messages";
import { Evidence } from "./Evidence";
export function CardView({
  card,
  canDecide,
  onBack,
  onChanged,
  onNotice,
}: {
  card: Card;
  canDecide: boolean;
  onBack: () => void;
  onChanged: () => void;
  onNotice: (value: string) => void;
}) {
  const [outcome, setOutcome] = useState("");
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const locked = useRef(false);
  useEffect(() => () => { generation.current += 1; }, []);
  if (!card.citations.length)
    return (
      <section className="detail">
        <button onClick={onBack}>목록으로 돌아가기</button>
        <p className="notice">근거를 확인하지 못해 내용을 보여 주지 않습니다.</p>
      </section>
    );
  const evidence = {
    id: card.card.id,
    status: "done" as const,
    answer: null,
    refused: false,
    citations: card.citations.map((entry) => ({
      quote: entry.quote,
      author: entry.author,
      source: entry.source,
      occurred_at: entry.occurredAt,
      href: entry.href,
    })),
  };
  const decide = async (
    status: "decided" | "deferred" | "rejected",
  ): Promise<void> => {
    if (locked.current) return;
    locked.current = true;
    const version = ++generation.current;
    const current = (): boolean => version === generation.current;
    setBusy(true);
    onNotice("");
    try {
      const result = await window.sasu.card.decide({
        id: card.card.id,
        status,
        outcome,
        rationale,
      });
      if (!current()) return;
      onNotice(result.message ?? "처리했습니다.");
      onChanged();
    } catch (cause) {
      if (current()) onNotice(message(cause));
    } finally {
      if (current()) { locked.current = false; setBusy(false); }
    }
  };
  const actionable =
    canDecide &&
    (card.card.status === "open" || card.card.status === "needs_review");
  return (
    <section className="detail">
      <button onClick={onBack}>목록으로 돌아가기</button>
      <h2>{card.card.title}</h2>
      <p>{card.card.background}</p>
      {card.card.recommendation ? (
        <p className="recommend">추천 · {card.card.recommendation}</p>
      ) : null}
      <Evidence answer={evidence} />
      {card.conflicts.length ? (
        <p className="notice">이전 결정과 함께 확인할 내용이 있습니다.</p>
      ) : null}
      {actionable ? (
        <form
          className="decision"
          onSubmit={(event) => {
            event.preventDefault();
            void decide("decided");
          }}
        >
          <label>
            결과
            <input
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
              maxLength={300}
              required
            />
          </label>
          <label>
            이유
            <textarea
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              maxLength={1000}
              required
            />
          </label>
          <div>
            <button disabled={busy} type="submit">
              결정하기
            </button>
            <button
              disabled={busy}
              type="button"
              onClick={() => void decide("deferred")}
            >
              미루기
            </button>
            <button
              disabled={busy}
              type="button"
              onClick={() => void decide("rejected")}
            >
              돌려보내기
            </button>
          </div>
        </form>
      ) : (
        <p className="notice">이미 처리한 카드입니다.</p>
      )}
    </section>
  );
}
