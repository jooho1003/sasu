import { describe, expect, it } from "vitest";
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
});
