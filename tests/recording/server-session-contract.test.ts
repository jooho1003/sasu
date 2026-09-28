import { describe, expect, it } from "vitest";
import {
  OriginalSegmentAccessGrant, RecordingCaptureMetadata, RecordingSave, RecordingSaveResult, ReviewRecordingStart,
} from "@/lib/contracts";
import { activeRecordingKey, recordingSecretForVersion, deriveRecordingKey } from "@/lib/recording/recording-key";

const input = {
  id: "33333333-3333-4333-8333-333333333333", title: "주간 회의",
  input_method: "microphone", visibility: "leads_only", participants: [],
  consent_confirmed: true, meeting_provider: "in_person",
};
const secret = "0123456789abcdef0123456789abcdef0123456789abcdef";
const next = "abcdef0123456789abcdef0123456789abcdef0123456789";

describe("recording start contract", () => {
  it("accepts metadata without any audio, with the recorder added by SQL", () => {
    expect(ReviewRecordingStart.parse(input)).toEqual(input);
  });
  it.each(["dept_id", "created_by", "key_version", "consent_snapshot", "original_path", "status", "audio", "synthetic"])("rejects client %s", (key) => {
    expect(ReviewRecordingStart.safeParse({ ...input, [key]: "forged" }).success).toBe(false);
  });
  it.each([
    { consent_confirmed: false }, { title: " " }, { title: "a".repeat(121) },
    { input_method: "upload" }, { meeting_provider: "arbitrary-url" }, { visibility: "public" },
    { participants: ["not-an-id"] }, { id: "not-an-id" },
    { participants: Array(101).fill(input.id) }, { participants: [input.id, input.id] },
  ])("rejects invalid session metadata %#", (change) => {
    expect(ReviewRecordingStart.safeParse({ ...input, ...change }).success).toBe(false);
  });
});

describe("recording key rotation", () => {
  it("keeps legacy configuration at version 1", () => {
    expect(activeRecordingKey({ RECORDING_KEY_SECRET: secret })).toEqual({ version: 1, secret });
    expect(recordingSecretForVersion({ RECORDING_KEY_SECRET: secret }, 1)).toBe(secret);
  });
  it("uses the session version, including an explicitly retained previous secret", () => {
    const env = { RECORDING_KEY_VERSION: "2", RECORDING_KEY_SECRET: next, RECORDING_KEY_PREVIOUS_VERSION: "1", RECORDING_KEY_PREVIOUS_SECRET: secret };
    expect(activeRecordingKey(env)).toEqual({ version: 2, secret: next });
    expect(recordingSecretForVersion(env, 1)).toBe(secret);
    expect(recordingSecretForVersion(env, 2)).toBe(next);
    expect(() => recordingSecretForVersion(env, 3)).toThrow("recording_key_unavailable");
  });
  it.each(["0", "-1", "1.5", "01", "NaN", "2147483648"])("rejects invalid configured version %s", (version) => {
    expect(() => activeRecordingKey({ RECORDING_KEY_SECRET: secret, RECORDING_KEY_VERSION: version })).toThrow();
  });
  it("does not fall back for missing, weak, or retired versions", () => {
    expect(() => activeRecordingKey({})).toThrow();
    expect(() => activeRecordingKey({ RECORDING_KEY_SECRET: "short" })).toThrow();
    expect(() => recordingSecretForVersion({ RECORDING_KEY_VERSION: "2", RECORDING_KEY_SECRET: next }, 1)).toThrow();
    expect(() => recordingSecretForVersion({ RECORDING_KEY_SECRET: secret }, undefined)).toThrow();
  });
  it("rejects ambiguous or incomplete rotation settings", () => {
    expect(() => activeRecordingKey({ RECORDING_KEY_SECRET: secret, RECORDING_KEY_PREVIOUS_VERSION: "1", RECORDING_KEY_PREVIOUS_SECRET: next })).toThrow();
    expect(() => activeRecordingKey({ RECORDING_KEY_SECRET: secret, RECORDING_KEY_PREVIOUS_VERSION: "2" })).toThrow();
  });
  it("binds version 2 while preserving the existing version 1 derivation", async () => {
    const context = { recordingId: input.id, userId: input.id, deptId: input.id };
    const legacy = await deriveRecordingKey(secret, context);
    expect(await deriveRecordingKey(secret, { ...context, keyVersion: 1 })).toEqual(legacy);
    expect(await deriveRecordingKey(secret, { ...context, keyVersion: 2 })).not.toEqual(legacy);
    await expect(deriveRecordingKey(secret, { ...context, keyVersion: 0 })).rejects.toThrow();
  });
});

const hash = "a".repeat(64);
const full = (index: number) => ({ index, sample_count: 960_000, bytes: 1_920_044, sha256: hash });
const manifest = { version: 1, segments: [full(0), { index: 1, sample_count: 16_073, bytes: 32_190, sha256: hash }] };
const capture = { paused: true, interrupted: false, captured_samples: 976_073 };

describe("recording save contract", () => {
  it("accepts only the v1 manifest and bounded capture metadata", () => {
    expect(RecordingSave.parse({ manifest, capture })).toEqual({ manifest, capture });
    expect(RecordingCaptureMetadata.parse(capture)).toEqual(capture);
  });
  it.each(["dept_id", "created_by", "review_id", "path", "attempt", "status", "consent_snapshot", "audio"])("rejects client %s", (key) => {
    expect(RecordingSave.safeParse({ manifest, capture, [key]: "forged" }).success).toBe(false);
    expect(RecordingCaptureMetadata.safeParse({ ...capture, [key]: "forged" }).success).toBe(false);
  });
  it.each([
    { captured_samples: 0 }, { captured_samples: 1.5 }, { captured_samples: 28_800_001 },
    { captured_samples: "976073" }, { paused: "false" }, { interrupted: null },
  ])("rejects invalid capture metadata %#", (change) => {
    expect(RecordingCaptureMetadata.safeParse({ ...capture, ...change }).success).toBe(false);
  });
  it("does not let capture metadata claim fewer samples than the saved originals", () => {
    expect(RecordingSave.safeParse({ manifest, capture: { ...capture, captured_samples: 976_072 } }).success).toBe(false);
    expect(RecordingSave.safeParse({ manifest: { version: 1, segments: [full(1)] }, capture }).success).toBe(false);
    expect(RecordingSave.safeParse({ manifest }).success).toBe(false);
  });
  it("parses the server result without trusting unknown states", () => {
    const result = {
      review_id: input.id, state: "saving",
      segments: [{ index: 0, attempt: 1, path: `dept/${input.id}/original-segments/0-1.wav`, status: "awaiting_upload", error_code: null }],
    };
    expect(RecordingSaveResult.parse(result)).toEqual(result);
    expect(RecordingSaveResult.safeParse({ ...result, state: "active" }).success).toBe(false);
    expect(RecordingSaveResult.safeParse({ ...result, segments: [{ ...result.segments[0], status: "done" }] }).success).toBe(false);
    expect(RecordingSaveResult.safeParse({ ...result, segments: [{ ...result.segments[0], attempt: 4 }] }).success).toBe(false);
  });
  it("binds a segment access grant to one bounded segment", () => {
    const grant = { token: input.id, path: "dept/review/original-segments/3-1.wav", kind: "audio", filename: "주간 회의.wav", segment_index: 3, sample_count: 960_000 };
    expect(OriginalSegmentAccessGrant.parse(grant)).toEqual(grant);
    expect(OriginalSegmentAccessGrant.safeParse({ ...grant, segment_index: 30 }).success).toBe(false);
    expect(OriginalSegmentAccessGrant.safeParse({ ...grant, sample_count: 960_001 }).success).toBe(false);
    expect(OriginalSegmentAccessGrant.safeParse({ ...grant, kind: "document" }).success).toBe(false);
  });
});
