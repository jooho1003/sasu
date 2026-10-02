// Design Ref: desktop-companion §6 — polling backs off without creating a second server-side scheduler.
const INBOX_NORMAL_MS = 30_000;
const INBOX_BACKOFF_MS = [60_000, 120_000, 300_000] as const;
const ANSWER_INTERVAL_MS = 2_000;
const ANSWER_TIMEOUT_MS = 120_000;

export function nextInboxDelay(
  prevMs: number,
  outcome: "ok" | "error" | "locked",
): number {
  if (outcome === "locked") return 0;
  if (outcome === "ok") return INBOX_NORMAL_MS;
  if (prevMs < INBOX_BACKOFF_MS[0]) return INBOX_BACKOFF_MS[0];
  if (prevMs < INBOX_BACKOFF_MS[1]) return INBOX_BACKOFF_MS[1];
  return INBOX_BACKOFF_MS[2];
}

export function answerPollPlan(
  startedAt: number,
  now: number,
): { next: number | null } {
  return {
    next: now - startedAt >= ANSWER_TIMEOUT_MS ? null : ANSWER_INTERVAL_MS,
  };
}

// Design Ref: desktop-companion §11.4 G3 — cancellation suppresses stale results as well as timers.
export function startAnswerPolling<T extends { status: string }>(callbacks: {
  getAnswer: () => Promise<T>;
  onAnswer: (answer: T) => void;
  onError: (cause: unknown) => void;
  onTimeout: () => void;
}): () => void {
  const startedAt = Date.now();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = (): void => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(deadline);
  };
  const poll = async (): Promise<void> => {
    if (stopped) return;
    if (answerPollPlan(startedAt, Date.now()).next === null) {
      stop();
      callbacks.onTimeout();
      return;
    }
    try {
      const answer = await callbacks.getAnswer();
      if (stopped) return;
      callbacks.onAnswer(answer);
      if (answer.status !== "pending") {
        stop();
        return;
      }
      const plan = answerPollPlan(startedAt, Date.now());
      if (plan.next === null) {
        stop();
        callbacks.onTimeout();
        return;
      }
      timer = setTimeout(() => void poll(), Math.min(plan.next, ANSWER_TIMEOUT_MS - (Date.now() - startedAt)));
    } catch (cause) {
      if (stopped) return;
      stop();
      callbacks.onError(cause);
    }
  };
  const deadline = setTimeout(() => {
    stop();
    callbacks.onTimeout();
  }, ANSWER_TIMEOUT_MS);
  void poll();
  return stop;
}
