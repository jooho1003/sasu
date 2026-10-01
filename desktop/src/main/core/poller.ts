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
