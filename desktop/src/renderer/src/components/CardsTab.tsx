import type { CompanionInbox } from "@sasu/contracts";
import type { Card } from "../../../shared/contracts";
import { message } from "../App";
import { CardView } from "./CardView";
export function CardsTab({
  card,
  inbox,
  role,
  onCard,
  onNotice,
  onChanged,
}: {
  card: Card | null;
  inbox: CompanionInbox | null;
  role: "lead" | "member";
  onCard: (card: Card | null) => void;
  onNotice: (value: string) => void;
  onChanged: () => void;
}) {
  if (card)
    return (
      <CardView
        card={card}
        canDecide={role === "lead" || card.card.status === "open"}
        onBack={() => onCard(null)}
        onChanged={onChanged}
        onNotice={onNotice}
      />
    );
  return (
    <>
      <h1>결정할 카드</h1>
      {(inbox?.cards ?? []).map((entry) => (
        <button
          className="row"
          key={entry.id}
          onClick={() =>
            void window.sasu.card
              .get(entry.id)
              .then(onCard)
              .catch((cause) => onNotice(message(cause)))
          }
        >
          {entry.title}
          <small>{entry.deadline ?? "마감 미정"}</small>
        </button>
      ))}
      {!inbox?.cards.length ? <p>지금 결정할 카드가 없습니다.</p> : null}
    </>
  );
}
