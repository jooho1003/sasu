import type { CompanionInbox } from "@sasu/contracts";
import { describe, expect, it } from "vitest";
import { computePetState, type SeenSet } from "../pet-state";

const UUIDS = {
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

describe("computePetState", () => {
  const unseen: SeenSet = new Set();

  it("prioritizes an unseen card that needs attention", () => {
    const state = computePetState(
      inbox({
        cards: [{ id: UUIDS.card, title: "결정할 일", deadline: null, status: "open" }],
        answers: [{ id: UUIDS.answer, status: "failed", created_at: "2026-10-01T23:00:00+09:00" }],
      }),
      unseen,
      0,
    );

    expect(state).toBe("needs_attention");
  });

  it("orders failure before completed work", () => {
    expect(
      computePetState(
        inbox({
          answers: [{ id: UUIDS.answer, status: "done", created_at: "2026-10-01T23:00:00+09:00" }],
          reviews: [{ id: UUIDS.review, kind: "document", title: "자료", status: "failed" }],
        }),
        unseen,
        0,
      ),
    ).toBe("failed");
  });

  it("recognizes completed answers, reviews, and sales tasks", () => {
    expect(
      computePetState(
        inbox({ sales: [{ id: UUIDS.sales, status: "ready" }] }),
        unseen,
        0,
      ),
    ).toBe("complete");
  });

  it("shows working for pending work or an offline question", () => {
    const seen: SeenSet = new Set([UUIDS.answer]);
    expect(
      computePetState(
        inbox({ answers: [{ id: UUIDS.answer, status: "done", created_at: "2026-10-01T23:00:00+09:00" }] }),
        seen,
        1,
      ),
    ).toBe("working");
  });

  it("rests when every item was seen and no work is active", () => {
    const seen: SeenSet = new Set([UUIDS.answer]);
    expect(
      computePetState(
        inbox({ answers: [{ id: UUIDS.answer, status: "done", created_at: "2026-10-01T23:00:00+09:00" }] }),
        seen,
        0,
      ),
    ).toBe("idle");
  });
});
