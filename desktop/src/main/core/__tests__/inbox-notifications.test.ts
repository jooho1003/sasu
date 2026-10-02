import type { CompanionInbox } from "@sasu/contracts";
import { describe, expect, it } from "vitest";
import { inboxNotificationCounts } from "../inbox-notifications";

const ids = {
  card: "11111111-1111-4111-8111-111111111111",
  answer: "22222222-2222-4222-8222-222222222222",
  review: "33333333-3333-4333-8333-333333333333",
  sales: "44444444-4444-4444-8444-444444444444",
};

function inbox(overrides: Partial<CompanionInbox> = {}): CompanionInbox {
  return {
    server_time: "2026-10-02T00:00:00+09:00",
    cards: [],
    answers: [],
    reviews: [],
    sales: [],
    ...overrides,
  };
}

describe("inboxNotificationCounts", () => {
  it("does not notify for the first summary because it is the comparison baseline", () => {
    expect(
      inboxNotificationCounts(null, inbox({ cards: [{ id: ids.card, title: "결정", deadline: null, status: "open" }] })),
    ).toEqual({ cards: 0, answers: 0, work: 0, failed: 0 });
  });

  it("notifies when a card arrives even when the pet state remains unchanged", () => {
    const previous = inbox({ cards: [{ id: ids.card, title: "기존", deadline: null, status: "open" }] });
    const next = inbox({
      cards: [
        ...previous.cards,
        { id: "55555555-5555-4555-8555-555555555555", title: "새 카드", deadline: null, status: "open" },
      ],
    });

    expect(inboxNotificationCounts(previous, next)).toEqual({
      cards: 1,
      answers: 0,
      work: 0,
      failed: 0,
    });
  });

  it("notifies once when work reaches a completed or failed state", () => {
    const previous = inbox({
      answers: [{ id: ids.answer, status: "pending", created_at: "2026-10-01T23:00:00+09:00" }],
      reviews: [{ id: ids.review, kind: "document", title: "자료", status: "processing" }],
      sales: [{ id: ids.sales, status: "processing" }],
    });
    const next = inbox({
      answers: [{ id: ids.answer, status: "done", created_at: "2026-10-01T23:00:00+09:00" }],
      reviews: [{ id: ids.review, kind: "document", title: "자료", status: "ready" }],
      sales: [{ id: ids.sales, status: "failed" }],
    });

    expect(inboxNotificationCounts(previous, next)).toEqual({
      cards: 0,
      answers: 1,
      work: 1,
      failed: 1,
    });
    expect(inboxNotificationCounts(next, next)).toEqual({
      cards: 0,
      answers: 0,
      work: 0,
      failed: 0,
    });
  });
});
