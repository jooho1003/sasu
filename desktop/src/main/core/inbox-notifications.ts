// Design Ref: desktop-companion §7 S7 — compare summaries by item transition, not pet state.
import type { CompanionInbox } from "@sasu/contracts";

export type InboxNotificationCounts = {
  cards: number;
  answers: number;
  work: number;
  failed: number;
};

const EMPTY_COUNTS: InboxNotificationCounts = {
  cards: 0,
  answers: 0,
  work: 0,
  failed: 0,
};

function includesTerminalAnswer(
  inbox: CompanionInbox,
  id: string,
): boolean {
  return inbox.answers.some(
    (answer) =>
      answer.id === id &&
      (answer.status === "done" || answer.status === "refused"),
  );
}

function includesReadyWork(inbox: CompanionInbox, id: string): boolean {
  return (
    inbox.reviews.some((review) => review.id === id && review.status === "ready") ||
    inbox.sales.some((sales) => sales.id === id && sales.status === "ready")
  );
}

function includesFailure(inbox: CompanionInbox, id: string): boolean {
  return (
    inbox.answers.some((answer) => answer.id === id && answer.status === "failed") ||
    inbox.reviews.some((review) => review.id === id && review.status === "failed") ||
    inbox.sales.some((sales) => sales.id === id && sales.status === "failed")
  );
}

export function inboxNotificationCounts(
  previous: CompanionInbox | null,
  current: CompanionInbox,
): InboxNotificationCounts {
  if (!previous) return EMPTY_COUNTS;

  return {
    cards: current.cards.filter(
      (card) => !previous.cards.some((previousCard) => previousCard.id === card.id),
    ).length,
    answers: current.answers.filter(
      (answer) =>
        (answer.status === "done" || answer.status === "refused") &&
        !includesTerminalAnswer(previous, answer.id),
    ).length,
    work:
      current.reviews.filter(
        (review) => review.status === "ready" && !includesReadyWork(previous, review.id),
      ).length +
      current.sales.filter(
        (sales) => sales.status === "ready" && !includesReadyWork(previous, sales.id),
      ).length,
    failed:
      current.answers.filter(
        (answer) => answer.status === "failed" && !includesFailure(previous, answer.id),
      ).length +
      current.reviews.filter(
        (review) => review.status === "failed" && !includesFailure(previous, review.id),
      ).length +
      current.sales.filter(
        (sales) => sales.status === "failed" && !includesFailure(previous, sales.id),
      ).length,
  };
}
