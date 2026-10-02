import { afterEach, describe, expect, it, vi } from "vitest";
import { answerPollPlan, nextInboxDelay, startAnswerPolling } from "../poller";

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

describe("startAnswerPolling", () => {
  afterEach(() => vi.useRealTimers());

  function fixture() {
    vi.useFakeTimers();
    return {
      getAnswer: vi.fn(async () => ({ status: "pending" })),
      onAnswer: vi.fn(), onError: vi.fn(), onTimeout: vi.fn(),
    };
  }

  it("shows the first lookup error and stops without an unhandled rejection", async () => {
    const callbacks = fixture();
    const error = new Error("network:연결을 확인해 주세요.");
    callbacks.getAnswer.mockRejectedValueOnce(error);
    startAnswerPolling(callbacks);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(callbacks.getAnswer).toHaveBeenCalledTimes(1);
  });

  it("also catches a later timer lookup failure", async () => {
    const callbacks = fixture();
    const error = new Error("network:연결을 확인해 주세요.");
    callbacks.getAnswer.mockResolvedValueOnce({ status: "pending" }).mockRejectedValueOnce(error);
    startAnswerPolling(callbacks);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(callbacks.onAnswer).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(callbacks.getAnswer).toHaveBeenCalledTimes(2);
  });

  it("polls at two seconds and stops on a terminal answer", async () => {
    const callbacks = fixture();
    callbacks.getAnswer.mockResolvedValueOnce({ status: "pending" }).mockResolvedValueOnce({ status: "done" });
    startAnswerPolling(callbacks);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(callbacks.getAnswer).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(callbacks.onAnswer).toHaveBeenLastCalledWith({ status: "done" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(callbacks.getAnswer).toHaveBeenCalledTimes(2);
  });

  it("stops at 120 seconds without one extra request", async () => {
    const callbacks = fixture();
    startAnswerPolling(callbacks);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(callbacks.onTimeout).toHaveBeenCalledTimes(1);
    expect(callbacks.getAnswer).toHaveBeenCalledTimes(60);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels scheduled polls when the question or screen is replaced", async () => {
    const callbacks = fixture();
    const stop = startAnswerPolling(callbacks);
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(callbacks.getAnswer).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ends the wait at 120 seconds even while a lookup is unresolved", async () => {
    const callbacks = fixture();
    let finish!: () => void;
    callbacks.getAnswer.mockImplementation(() => new Promise((resolve) => {
      finish = () => resolve({ status: "done" });
    }));
    startAnswerPolling(callbacks);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(callbacks.onTimeout).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(callbacks.onAnswer).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["resolve", "reject"])("ignores an in-flight %s after cancellation", async (result) => {
    const callbacks = fixture();
    let finish!: () => void;
    callbacks.getAnswer.mockImplementation(() => new Promise((resolve, reject) => {
      finish = () => result === "resolve" ? resolve({ status: "done" }) : reject(new Error("network"));
    }));
    const stop = startAnswerPolling(callbacks);
    stop(); finish();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(callbacks.onAnswer).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
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
