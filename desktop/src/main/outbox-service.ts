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
  private generation = 0;
  private workTail: Promise<unknown> = Promise.resolve();
  private fileTail: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly file: EncryptedFile,
    private readonly api: ApiClient,
  ) {}

  send(input: AskInput): Promise<AskResult> {
    const generation = this.generation;
    return this.serialize(() => this.sendCurrent(input, generation));
  }

  private async sendCurrent(input: AskInput, generation: number): Promise<AskResult> {
    this.assertCurrent(generation);
    await this.flushCurrent(generation);
    const waiting = await this.read(generation);
    if (waiting.length > 0) return this.queue(waiting, input, generation);
    try {
      const response = await this.api.postJson(
        "/api/companion/ask",
        input,
        parseAskStart,
      );
      this.assertCurrent(generation);
      return response;
    } catch (cause) {
      this.assertCurrent(generation);
      if (!(cause instanceof ApiError)) throw cause;
      if (!this.shouldKeep(cause)) {
        // Design Ref: desktop-companion §6 — only the daily ask limit gets this notice; other 4xx keep the server message.
        if (cause.status === 429) {
          throw new Error("daily_limit:오늘 질문 한도를 모두 사용했습니다.", { cause });
        }
        throw cause;
      }
      return this.queue(await this.read(generation), input, generation, cause);
    }
  }

  flush(): Promise<void> {
    const generation = this.generation;
    return this.serialize(async () => {
      if (generation !== this.generation) return;
      try {
        await this.flushCurrent(generation);
      } catch (cause) {
        if (generation === this.generation) throw cause;
      }
    });
  }

  private async flushCurrent(generation: number): Promise<void> {
    let items = await this.read(generation);
    while (true) {
      const next = nextToSend(items, Date.now());
      if (!next) {
        await this.writeOrRemove([], generation);
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
        this.assertCurrent(generation);
        if (!(cause instanceof ApiError)) throw cause;
        // A successful HTTP response with an invalid body must never be posted again.
        status = cause.code === "invalid_response" ? 400 : cause.status;
        if (cause.status === null && !this.shouldKeep(cause)) throw cause;
      }
      this.assertCurrent(generation);
      if (status === 401) {
        await this.writeOrRemove([], generation);
        return;
      }
      const updated = applySendResult(items, next.id, { status });
      if (updated === items) return;
      items = updated;
      await this.writeOrRemove(items, generation);
    }
  }

  count(): Promise<number> {
    const generation = this.generation;
    return this.serialize(async () => generation === this.generation ? (await this.read(generation)).length : 0);
  }

  invalidate(): void {
    this.generation += 1;
  }

  remove(): Promise<void> {
    this.invalidate();
    // Deliberately separate from workTail: a 401 callback may clear local
    // storage while flush is awaiting that same callback.
    return this.mutate(() => this.file.remove());
  }

  private assertCurrent(generation: number): void {
    if (generation !== this.generation) {
      throw new ApiError(401, "session_changed", "기기 로그인이 종료되었습니다.");
    }
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.workTail.then(operation);
    this.workTail = result.catch(() => undefined);
    return result;
  }

  private mutate(operation: () => Promise<void>): Promise<void> {
    const result = this.fileTail.then(operation);
    this.fileTail = result.catch(() => undefined);
    return result;
  }

  private shouldKeep(error: ApiError): boolean {
    return error.code !== "invalid_response" && (
      error.code === "network" || error.code === "timeout" || (error.status !== null && error.status >= 500)
    );
  }

  private async read(generation: number): Promise<OutboxItem[]> {
    this.assertCurrent(generation);
    await this.fileTail;
    const value = await this.file.read<unknown>([]);
    this.assertCurrent(generation);
    const stored = OutboxFile.parse(value);
    const items = purgeExpired(stored, Date.now());
    if (items.length !== stored.length) {
      await this.writeOrRemove(items, generation);
    }
    return items;
  }

  private async queue(
    current: OutboxItem[],
    input: AskInput,
    generation: number,
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
    await this.writeOrRemove(queued.items, generation);
    this.assertCurrent(generation);
    return { queued: true, outbox_id: item.id };
  }

  private writeOrRemove(items: OutboxItem[], generation: number): Promise<void> {
    return this.mutate(async () => {
      this.assertCurrent(generation);
      if (items.length === 0) await this.file.remove();
      else await this.file.write(items);
    });
  }
}
