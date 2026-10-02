import { describe, expect, it, vi } from "vitest";
import { ApiError, type ApiClient } from "../api/client";
import type { EncryptedFile } from "../storage/encrypted-file";
import { OutboxService } from "../outbox-service";

function emptyFile(): EncryptedFile {
  const file = {
    read: async <T>(fallback: T) => fallback,
    write: async () => undefined,
    remove: async () => undefined,
  };
  return file as unknown as EncryptedFile;
}

function failingApi(error: ApiError): ApiClient {
  const api = { postJson: async () => { throw error; } };
  return api as unknown as ApiClient;
}

const question = { question: "이번 견적 할인 기준이 뭐예요?" };

function storedFile(initial: unknown = []) {
  let value = initial;
  const file = {
    read: vi.fn(async () => structuredClone(value)),
    write: vi.fn(async (next: unknown) => { value = structuredClone(next); }),
    remove: vi.fn(async () => { value = []; }),
  };
  return { file: file as unknown as EncryptedFile, state: () => value, remove: file.remove };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const saved = { id: "saved", ...question, parentId: null, createdAt: Date.now() };
const accepted = { answer_id: "answer", job_id: "job", truncated: false };

describe("OutboxService.send", () => {
  it("maps only the daily ask limit (429) to the daily-limit notice", async () => {
    const service = new OutboxService(emptyFile(), failingApi(new ApiError(429, "ask_daily_limit", "limit")));
    await expect(service.send(question)).rejects.toThrow(/^daily_limit:/);
  });

  it.each([
    [400, "invalid_input"],
    [401, "session_invalid"],
    [403, "ask_parent_forbidden"],
  ])("rethrows %i %s unchanged instead of the daily-limit notice", async (status, code) => {
    const error = new ApiError(status, code, "server message");
    const service = new OutboxService(emptyFile(), failingApi(error));
    await expect(service.send(question)).rejects.toBe(error);
  });

  it("keeps network failures in the outbox", async () => {
    const service = new OutboxService(emptyFile(), failingApi(new ApiError(null, "network", "offline")));
    await expect(service.send(question)).resolves.toMatchObject({ queued: true });
  });

  it.each([200, 503])("does not queue invalid_response with HTTP %i", async (status) => {
    const error = new ApiError(status, "invalid_response", "invalid");
    const store = storedFile();
    const service = new OutboxService(store.file, failingApi(error));
    await expect(service.send(question)).rejects.toBe(error);
    expect(store.state()).toEqual([]);
  });

  it("preserves simultaneous offline questions", async () => {
    const store = storedFile();
    const service = new OutboxService(store.file, failingApi(new ApiError(null, "network", "offline")));
    const other = { question: "두 번째 질문도 함께 보관해 주세요." };
    await Promise.all([service.send(question), service.send(other)]);
    expect(store.state()).toMatchObject([{ question: question.question }, { question: other.question }]);
  });
});

describe("OutboxService lifecycle", () => {
  it("serializes timer, inbox and send flushes without duplicate delivery", async () => {
    const store = storedFile([saved]);
    const pending = deferred<typeof accepted>();
    const postJson = vi.fn(() => pending.promise);
    const service = new OutboxService(store.file, { postJson } as unknown as ApiClient);
    const tasks = [service.flush(), service.flush(), service.flush()];
    await vi.waitFor(() => expect(postJson).toHaveBeenCalledTimes(1));
    pending.resolve(accepted);
    await Promise.all(tasks);
    expect(postJson).toHaveBeenCalledTimes(1);
    expect(store.state()).toEqual([]);
  });

  it("discards invalid_response instead of retrying a queued question", async () => {
    const store = storedFile([saved]);
    const postJson = vi.fn(async () => { throw new ApiError(200, "invalid_response", "invalid"); });
    const service = new OutboxService(store.file, { postJson } as unknown as ApiClient);
    await service.flush();
    await service.flush();
    expect(postJson).toHaveBeenCalledTimes(1);
    expect(store.state()).toEqual([]);
  });

  it.each(["success", "offline"])("does not recreate storage after removal during %s", async (result) => {
    const store = storedFile([saved]);
    const pending = deferred<typeof accepted>();
    const postJson = vi.fn(() => pending.promise);
    const service = new OutboxService(store.file, { postJson } as unknown as ApiClient);
    const flushing = service.flush();
    await vi.waitFor(() => expect(postJson).toHaveBeenCalledOnce());
    await service.remove();
    if (result === "success") pending.resolve(accepted);
    else pending.reject(new ApiError(null, "network", "offline"));
    await flushing;
    expect(store.state()).toEqual([]);
  });

  it("rejects an interrupted send and pending old sends after local removal", async () => {
    const store = storedFile();
    const pending = deferred<typeof accepted>();
    const postJson = vi.fn(() => pending.promise);
    const service = new OutboxService(store.file, { postJson } as unknown as ApiClient);
    const sends = Promise.allSettled([service.send(question), service.send(question)]);
    await vi.waitFor(() => expect(postJson).toHaveBeenCalledOnce());
    await service.remove();
    pending.reject(new ApiError(null, "network", "offline"));
    const results = await sends;
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(postJson).toHaveBeenCalledOnce();
    expect(store.state()).toEqual([]);
  });

  it("allows a 401 handler to await removal inside a flush without deadlock", async () => {
    const store = storedFile([saved]);
    const postJson = vi.fn(async () => {
      await service.remove();
      throw new ApiError(401, "session_invalid", "signed out");
    });
    const service = new OutboxService(store.file, { postJson } as unknown as ApiClient);
    await service.flush();
    expect(store.state()).toEqual([]);
  });

  it("waits for an active disk write before deleting and recovers after write failure", async () => {
    const store = storedFile();
    const writing = deferred<void>();
    const write = vi.spyOn(store.file, "write").mockImplementationOnce(() => writing.promise);
    const service = new OutboxService(store.file, failingApi(new ApiError(null, "network", "offline")));
    const sending = Promise.allSettled([service.send(question)]);
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    const removing = service.remove();
    await Promise.resolve();
    expect(store.remove).toHaveBeenCalledTimes(1); // empty initial flush only
    writing.reject(new Error("disk_failed"));
    await sending;
    await removing;
    await expect(service.send(question)).resolves.toMatchObject({ queued: true });
    expect(store.state()).toMatchObject([{ question: question.question }]);
  });
});
