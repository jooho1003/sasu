import { describe, expect, it } from "vitest";
import {
  addToOutbox,
  applySendResult,
  nextToSend,
  purgeExpired,
  type OutboxItem,
} from "../outbox";

const HOUR = 60 * 60 * 1_000;
const now = Date.parse("2026-10-02T00:00:00Z");

function item(index: number, createdAt = now): OutboxItem {
  return {
    id: `question-${index}`,
    question: `다섯 글자 질문 ${index}`,
    parentId: null,
    createdAt,
  };
}

describe("outbox", () => {
  it("rejects a twenty-first live question", () => {
    const full = Array.from({ length: 20 }, (_, index) => item(index));
    const result = addToOutbox(full, item(20), now);
    expect(result.accepted).toBe(false);
    expect(result.items).toHaveLength(20);
  });

  it("drops items older than 24 hours before accepting", () => {
    const result = addToOutbox([item(1, now - 25 * HOUR)], item(2), now);
    expect(result.accepted).toBe(true);
    expect(result.items.map(({ id }) => id)).toEqual(["question-2"]);
  });

  it("purges expired items without changing live order", () => {
    expect(
      purgeExpired([item(1, now - 25 * HOUR), item(2, now - HOUR)], now).map(
        ({ id }) => id,
      ),
    ).toEqual(["question-2"]);
  });

  it("sends the oldest unexpired item first", () => {
    const items = [item(2, now - HOUR), item(1, now - 2 * HOUR)];
    expect(nextToSend(items, now)?.id).toBe("question-1");
  });

  it("removes success and non-rate-limit 4xx results", () => {
    const items = [item(1)];
    expect(applySendResult(items, "question-1", { status: 202 })).toEqual([]);
    expect(applySendResult(items, "question-1", { status: 400 })).toEqual([]);
  });

  it("keeps network, 5xx, and 429 results", () => {
    const items = [item(1)];
    expect(applySendResult(items, "question-1", { status: null })).toEqual(items);
    expect(applySendResult(items, "question-1", { status: 503 })).toEqual(items);
    expect(applySendResult(items, "question-1", { status: 429 })).toEqual(items);
  });
});
