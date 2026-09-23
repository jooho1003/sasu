import { describe, expect, test } from "vitest";

import { deriveRecordingKey } from "@/lib/recording/recording-key";

describe("recording key derivation", () => {
  test("is deterministic and binds the key to recording, user, and department", async () => {
    const secret = "0123456789abcdef0123456789abcdef0123456789abcdef";
    const context = {
      recordingId: "33333333-3333-4333-8333-333333333333",
      userId: "11111111-1111-4111-8111-111111111111",
      deptId: "22222222-2222-4222-8222-222222222222",
    };

    const first = await deriveRecordingKey(secret, context);
    const second = await deriveRecordingKey(secret, context);

    expect(first).toHaveLength(32);
    expect(first).toEqual(second);
    await expect(
      deriveRecordingKey(secret, { ...context, recordingId: "44444444-4444-4444-8444-444444444444" }),
    ).resolves.not.toEqual(first);
    await expect(
      deriveRecordingKey(secret, { ...context, userId: "55555555-5555-4555-8555-555555555555" }),
    ).resolves.not.toEqual(first);
    await expect(
      deriveRecordingKey(secret, { ...context, deptId: "66666666-6666-4666-8666-666666666666" }),
    ).resolves.not.toEqual(first);
  });

  test("rejects weak secrets and malformed context", async () => {
    await expect(
      deriveRecordingKey("too-short", {
        recordingId: "recording",
        userId: "user",
        deptId: "dept",
      }),
    ).rejects.toThrow("recording_key_secret_invalid");

    await expect(
      deriveRecordingKey("0123456789abcdef0123456789abcdef", {
        recordingId: "",
        userId: "user",
        deptId: "dept",
      }),
    ).rejects.toThrow("recording_key_context_invalid");
  });
});
