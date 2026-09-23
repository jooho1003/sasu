import { describe, expect, test } from "vitest";

import {
  decryptRecordingCheckpoint,
  encryptRecordingCheckpoint,
  importRecordingKey,
  recordingNonce,
} from "@/lib/recording/checkpoint-crypto";

const scope = {
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  deptId: "22222222-2222-4222-8222-222222222222",
  recordingId: "33333333-3333-4333-8333-333333333333",
};

describe("recording checkpoint encryption", () => {
  test("round-trips PCM while binding ciphertext to scope, sequence, and sample count", async () => {
    const key = await importRecordingKey(new Uint8Array(32).fill(7));
    const prefix = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const pcm = new Int16Array([0, 1, -1, 32767, -32768, 1234]);

    const encrypted = await encryptRecordingCheckpoint(key, scope, prefix, {
      sequence: 4,
      pcm,
    });

    expect(encrypted.sequence).toBe(4);
    expect(encrypted.sampleCount).toBe(pcm.length);
    expect(encrypted.ciphertext.byteLength).toBeGreaterThan(pcm.byteLength);
    expect(new Uint8Array(encrypted.ciphertext)).not.toEqual(new Uint8Array(pcm.buffer));

    const restored = await decryptRecordingCheckpoint(key, scope, prefix, encrypted);
    expect(Array.from(restored.pcm)).toEqual(Array.from(pcm));
    expect(restored.sequence).toBe(4);

    await expect(
      decryptRecordingCheckpoint(key, { ...scope, deptId: "other" }, prefix, encrypted),
    ).rejects.toThrow("recording_checkpoint_decrypt_failed");
    await expect(
      decryptRecordingCheckpoint(key, scope, prefix, { ...encrypted, sequence: 5 }),
    ).rejects.toThrow("recording_checkpoint_decrypt_failed");
  });

  test("uses an eight-byte recording prefix plus a big-endian sequence", () => {
    const prefix = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2]);
    expect(Array.from(recordingNonce(prefix, 0x01020304))).toEqual([
      9, 8, 7, 6, 5, 4, 3, 2, 1, 2, 3, 4,
    ]);
  });

  test("rejects invalid key, prefix, sequence, and sample sizes", async () => {
    await expect(importRecordingKey(new Uint8Array(31))).rejects.toThrow("recording_key_invalid");
    expect(() => recordingNonce(new Uint8Array(7), 0)).toThrow("recording_nonce_invalid");
    expect(() => recordingNonce(new Uint8Array(8), -1)).toThrow("recording_sequence_invalid");

    const key = await importRecordingKey(new Uint8Array(32));
    await expect(
      encryptRecordingCheckpoint(key, scope, new Uint8Array(8), {
        sequence: 0,
        pcm: new Int16Array(),
      }),
    ).rejects.toThrow("recording_checkpoint_invalid");
  });
});
