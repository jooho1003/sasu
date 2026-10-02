// Design Ref: desktop-companion §6·§7 S6 — only failed questions receive bounded encrypted retry storage.
const MAX_ITEMS = 20;
const MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export type OutboxItem = {
  id: string;
  question: string;
  parentId: string | null;
  createdAt: number;
};

export type SendResult = { status: number | null };

export function purgeExpired(items: OutboxItem[], now: number): OutboxItem[] {
  return items.filter((item) => now - item.createdAt < MAX_AGE_MS);
}

export function addToOutbox(
  items: OutboxItem[],
  item: OutboxItem,
  now: number,
): { items: OutboxItem[]; accepted: boolean } {
  const live = purgeExpired(items, now);
  if (live.length >= MAX_ITEMS || live.some(({ id }) => id === item.id)) {
    return { items: live, accepted: false };
  }
  return { items: [...live, item], accepted: true };
}

export function nextToSend(
  items: OutboxItem[],
  now: number,
): OutboxItem | null {
  return (
    // Stable sorting preserves insertion order when timestamps share a millisecond.
    purgeExpired(items, now).toSorted((left, right) => left.createdAt - right.createdAt)[0] ?? null
  );
}

export function applySendResult(
  items: OutboxItem[],
  id: string,
  result: SendResult,
): OutboxItem[] {
  const removable =
    result.status !== null &&
    ((result.status >= 200 && result.status < 300) ||
      (result.status >= 400 && result.status < 500));
  return removable ? items.filter((item) => item.id !== id) : items;
}
