import { describe, expect, it } from "vitest";
import { answerPollPlan, nextInboxDelay } from "../poller";

describe("nextInboxDelay", () => {
  it("returns to 30 seconds after success", () => {
    expect(nextInboxDelay(300_000, "ok")).toBe(30_000);
  });

  it("backs off errors to 60, 120, then 300 seconds", () => {
    expect(nextInboxDelay(30_000, "error")).toBe(60_000);
    expect(nextInboxDelay(60_000, "error")).toBe(120_000);
    expect(nextInboxDelay(120_000, "error")).toBe(300_000);
    expect(nextInboxDelay(300_000, "error")).toBe(300_000);
  });

  it("stops while the screen is locked", () => {
    expect(nextInboxDelay(30_000, "locked")).toBe(0);
  });
});

describe("answerPollPlan", () => {
  it("polls every two seconds before the deadline", () => {
    expect(answerPollPlan(1_000, 120_999)).toEqual({ next: 2_000 });
  });

  it("stops at 120 seconds", () => {
    expect(answerPollPlan(1_000, 121_000)).toEqual({ next: null });
  });
});
