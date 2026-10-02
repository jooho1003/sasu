// Design Ref: desktop-companion §6·§7 S6 — reconnect flushes encrypted questions in insertion order.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ApiClient } from "./api/client";
import { ApiError } from "./api/client";
import type { EncryptedFile } from "./storage/encrypted-file";
import {
  addToOutbox,
  applySendResult,
  nextToSend,
  purgeExpired,
  type OutboxItem,
} from "./core/outbox";
import { parseAskStart, type AskStart } from "../shared/contracts";

const OutboxFile = z.array(
  z.strictObject({
    id: z.string().min(1).max(100),
    question: z.string().trim().min(5).max(1_000),
    parentId: z.guid().nullable(),
    createdAt: z.number().int().nonnegative(),
  }),
).max(20);

export type AskInput = { question: string; parent_id?: string | null };
export type AskResult = AskStart | { queued: true; outbox_id: string };

export class OutboxService {
  constructor(
    private readonly file: EncryptedFile,
    private readonly api: ApiClient,
  ) {}

  async send(input: AskInput): Promise<AskResult> {
    await this.flush();
    const waiting = await this.read();
    if (waiting.length > 0) return this.queue(waiting, input);
    try {
      const response = await this.api.postJson(
        "/api/companion/ask",
        input,
        parseAskStart,
      );
      await this.flush();
      return response;
    } catch (cause) {
      if (!(cause instanceof ApiError)) throw cause;
      if (!this.shouldKeep(cause)) {
        // Design Ref: desktop-companion §6 — only the daily ask limit gets this notice; other 4xx keep the server message.
        if (cause.status === 429) {
          throw new Error("daily_limit:오늘 질문 한도를 모두 사용했습니다.", { cause });
        }
        throw cause;
      }
      return this.queue(await this.read(), input, cause);
    }
  }

  async flush(): Promise<void> {
    let items = await this.read();
    while (true) {
      const next = nextToSend(items, Date.now());
      if (!next) {
        await this.file.remove();
        return;
      }
      let status: number | null;
      try {
        await this.api.postJson(
          "/api/companion/ask",
          { question: next.question, parent_id: next.parentId },
          parseAskStart,
        );
        status = 202;
      } catch (cause) {
        status = cause instanceof ApiError ? cause.status : null;
      }
      if (status === 401) {
        await this.file.remove();
        return;
      }
      const updated = applySendResult(items, next.id, { status });
      if (updated === items) return;
      items = updated;
      await this.writeOrRemove(items);
    }
  }

  async count(): Promise<number> {
    return (await this.read()).length;
  }

  private shouldKeep(error: ApiError): boolean {
    return error.status === null || error.status >= 500;
  }

  private async read(): Promise<OutboxItem[]> {
    const value = await this.file.read<unknown>([]);
    const stored = OutboxFile.parse(value);
    const items = purgeExpired(stored, Date.now());
    if (items.length !== stored.length) {
      await this.writeOrRemove(items);
    }
    return items;
  }

  private async queue(
    current: OutboxItem[],
    input: AskInput,
    cause?: unknown,
  ): Promise<{ queued: true; outbox_id: string }> {
    const item: OutboxItem = {
      id: randomUUID(),
      question: input.question,
      parentId: input.parent_id ?? null,
      createdAt: Date.now(),
    };
    const queued = addToOutbox(current, item, Date.now());
    if (!queued.accepted) throw new Error("outbox_full", { cause });
    await this.file.write(queued.items);
    return { queued: true, outbox_id: item.id };
  }

  private async writeOrRemove(items: OutboxItem[]): Promise<void> {
    if (items.length === 0) {
      await this.file.remove();
      return;
    }
    await this.file.write(items);
  }
}
