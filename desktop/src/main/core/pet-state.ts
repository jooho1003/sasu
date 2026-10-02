// Design Ref: desktop-companion §5.2 — a deterministic local priority keeps the pet free of authority logic.
import type { CompanionInbox } from "@sasu/contracts";

export type SeenSet = ReadonlySet<string>;
export type PetState =
  | "needs_attention"
  | "failed"
  | "complete"
  | "working"
  | "idle";

function unseen(id: string, seen: SeenSet): boolean {
  return !seen.has(id);
}

export function computePetState(
  inbox: CompanionInbox,
  seen: SeenSet,
  outboxCount: number,
): PetState {
  if (inbox.cards.some((card) => unseen(card.id, seen))) {
    return "needs_attention";
  }

  const hasUnseenFailure =
    inbox.answers.some(
      (answer) => answer.status === "failed" && unseen(answer.id, seen),
    ) ||
    inbox.reviews.some(
      (review) => review.status === "failed" && unseen(review.id, seen),
    ) ||
    inbox.sales.some(
      (sales) => sales.status === "failed" && unseen(sales.id, seen),
    );
  if (hasUnseenFailure) return "failed";

  const hasUnseenCompletion =
    inbox.answers.some(
      (answer) =>
        (answer.status === "done" || answer.status === "refused") &&
        unseen(answer.id, seen),
    ) ||
    inbox.reviews.some(
      (review) => review.status === "ready" && unseen(review.id, seen),
    ) ||
    inbox.sales.some(
      (sales) => sales.status === "ready" && unseen(sales.id, seen),
    );
  if (hasUnseenCompletion) return "complete";

  const hasActiveWork =
    outboxCount > 0 ||
    inbox.answers.some((answer) => answer.status === "pending") ||
    inbox.reviews.some(
      (review) =>
        review.status === "uploading" || review.status === "processing",
    ) ||
    inbox.sales.some(
      (sales) => sales.status === "queued" || sales.status === "processing",
    );
  return hasActiveWork ? "working" : "idle";
}
