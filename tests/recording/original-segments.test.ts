import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RecordingManifest, RecordingOriginalSegment } from "@/lib/contracts";
import { pcmWav, RECORDING_RATE } from "@/lib/recording/pcm";
import { validateAudioPart } from "@/lib/adapters/review-audio";
import {
  canonicalRecordingManifest, recordingManifestFingerprint, recordingManifestTotals,
  streamRecordingOriginals, prepareRecordingOriginalManifest, verifyRecordingOriginal, createRecordingTranscriptionPart,
} from "@/lib/recording/original-segments";

const fullSamples = 60 * RECORDING_RATE;
const hex = "a".repeat(64);
const descriptor = (index: number, samples = fullSamples) => ({ index, sample_count: samples, bytes: 44 + samples * 2, sha256: hex });
function* checkpoints(seconds: number, tail = 0) {
  for (let sequence = 0; sequence < seconds; sequence++)
    yield { sequence, pcm: new Int16Array(RECORDING_RATE).fill(sequence + 1) };
  if (tail) yield { sequence: seconds, pcm: new Int16Array(tail).fill(-123) };
}
async function collect(source: ReturnType<typeof streamRecordingOriginals>) {
  const result = [];
  for await (const segment of source) result.push(segment);
  return result;
}
function file(index: number, samples: number, value: number) {
  const wav = new Uint8Array(pcmWav(new Int16Array(samples).fill(value)));
  return { wav, descriptor: { ...descriptor(index, samples), sha256: createHash("sha256").update(wav).digest("hex") } };
}

describe("recording original manifest v1", () => {
  it("accepts 30 full originals without changing the existing 50 MiB file-upload limit", () => {
    const manifest = { version: 1, segments: Array.from({ length: 30 }, (_, index) => descriptor(index)) };
    expect(RecordingManifest.parse(manifest)).toEqual(manifest);
    expect(recordingManifestTotals(manifest)).toEqual({ samples: 28_800_000, bytes: 57_601_320, durationSeconds: 1800 });
  });

  it.each([
    { version: 2, segments: [descriptor(0)] },
    { version: 1, segments: [] },
    { version: 1, segments: [descriptor(1)] },
    { version: 1, segments: [descriptor(0), descriptor(0)] },
    { version: 1, segments: [descriptor(0, 1), descriptor(1)] },
    { version: 1, segments: [descriptor(0), descriptor(2)] },
    { version: 1, segments: Array.from({ length: 31 }, (_, index) => descriptor(index)) },
    { version: 1, segments: [{ ...descriptor(0), object_path: "another-dept/original" }] },
    { version: 1, segments: [descriptor(0)], dept_id: "injected" },
  ])("rejects invalid or reordered manifests %#", (value) => {
    expect(RecordingManifest.safeParse(value).success).toBe(false);
    expect(() => canonicalRecordingManifest(value)).toThrow();
  });

  it.each([
    { ...descriptor(0), sample_count: 0 },
    { ...descriptor(0), sample_count: 1.5 },
    descriptor(0, fullSamples + 1),
    { ...descriptor(0), bytes: 1_920_043 },
    { ...descriptor(0), sha256: "A".repeat(64) },
    { ...descriptor(0), index: -1 },
    { ...descriptor(0), index: 30 },
    { ...descriptor(0), bytes: Number.POSITIVE_INFINITY },
  ])("rejects invalid segment metadata %#", (value) => {
    expect(RecordingOriginalSegment.safeParse(value).success).toBe(false);
  });

  it("pins exact UTF-8 canonical bytes, independent of object key order", async () => {
    const manifest = { version: 1, segments: [descriptor(0, 1)] };
    const reordered = { segments: [{ sha256: hex, bytes: 46, sample_count: 1, index: 0 }], version: 1 };
    const canonical = `sasu-recording-manifest-v1\n0:1:46:${hex}\n`;
    expect(canonicalRecordingManifest(manifest)).toBe(canonical);
    expect(canonicalRecordingManifest(reordered)).toBe(canonical);
    expect(await recordingManifestFingerprint(manifest)).toBe(createHash("sha256").update(canonical, "utf8").digest("hex"));
    expect(await recordingManifestFingerprint(reordered)).toBe(await recordingManifestFingerprint(manifest));
    expect(await recordingManifestFingerprint({ version: 1, segments: [descriptor(0, 2)] })).not.toBe(await recordingManifestFingerprint(manifest));
  });
});

describe("bounded checkpoint to independent original WAV conversion", () => {
  it("splits 61 seconds plus a tail without duplicating boundary samples", async () => {
    const segments = await collect(streamRecordingOriginals(checkpoints(61, 73)));
    expect(segments.map(({ descriptor }) => [descriptor.index, descriptor.sample_count, descriptor.bytes]))
      .toEqual([[0, 960_000, 1_920_044], [1, 16073, 32190]]);
    for (const segment of segments) await expect(verifyRecordingOriginal(segment.wav, segment.descriptor)).resolves.toBeUndefined();
    const first = new DataView(segments[0].wav.buffer);
    const last = new DataView(segments[1].wav.buffer);
    expect(first.getInt16(44, true)).toBe(1);
    expect(first.getInt16(44 + 59 * 32000, true)).toBe(60);
    expect(last.getInt16(44, true)).toBe(61);
    expect(last.getInt16(last.byteLength - 2, true)).toBe(-123);
  });

  it("does not prefetch the next original and closes the source on cancellation", async () => {
    let reads = 0;
    let closed = false;
    async function* source() {
      try { for (const checkpoint of checkpoints(120)) { reads++; yield checkpoint; } }
      finally { closed = true; }
    }
    const segments = streamRecordingOriginals(source());
    const first = await segments.next();
    expect(first.done).toBe(false);
    expect(reads).toBe(60);
    await segments.return();
    expect(closed).toBe(true);
    expect(reads).toBe(60);
  });

  it("handles the exact 30-minute limit without emitting an empty final WAV", async () => {
    let count = 0;
    let total = 0;
    for await (const { descriptor: segment, wav } of streamRecordingOriginals(checkpoints(1800))) {
      expect(segment.index).toBe(count++);
      expect(wav.byteLength).toBeLessThanOrEqual(1_920_044);
      total += segment.sample_count;
    }
    expect(count).toBe(30);
    expect(total).toBe(28_800_000);
  });

  it.each([
    [],
    [{ sequence: 1, pcm: new Int16Array(16000) }],
    [{ sequence: 0, pcm: new Int16Array(16000) }, { sequence: 0, pcm: new Int16Array(16000) }],
    [{ sequence: 0, pcm: new Int16Array(16000) }, { sequence: 2, pcm: new Int16Array(16000) }],
    [{ sequence: 0, pcm: new Int16Array(1) }, { sequence: 1, pcm: new Int16Array(1) }],
    [{ sequence: 0, pcm: new Int16Array(0) }],
    [{ sequence: 0, pcm: new Int16Array(16001) }],
  ].map((source) => ({ source })))("fails closed on gaps, duplicates, empty or non-final short checkpoints %#", async ({ source }) => {
    await expect(collect(streamRecordingOriginals(source))).rejects.toThrow(source.length ? "recording_checkpoint_invalid" : "recording_empty");
  });

  it("rejects data beyond 30 minutes", async () => {
    await expect(collect(streamRecordingOriginals(checkpoints(1801)))).rejects.toThrow("recording_checkpoint_invalid");
  });

  it("refuses a silently shortened recovery instead of declaring a complete bundle", async () => {
    await expect(prepareRecordingOriginalManifest(checkpoints(60), 61 * RECORDING_RATE))
      .rejects.toThrow("recording_recovery_changed");
    await expect(prepareRecordingOriginalManifest(checkpoints(61), 60 * RECORDING_RATE))
      .rejects.toThrow("recording_recovery_changed");
    const result = await prepareRecordingOriginalManifest(checkpoints(60, 73), fullSamples + 73);
    expect(recordingManifestTotals(result.manifest).samples).toBe(fullSamples + 73);
    expect(result.fingerprint).toBe(await recordingManifestFingerprint(result.manifest));
  });
});

describe("strict original WAV verification and transcription boundaries", () => {
  it.each([
    [0, 0], [8, 0], [12, 0], [36, 0], [4, 0], [16, 18], [20, 3], [22, 2],
    [24, 0], [28, 1], [32, 4], [34, 8], [40, 1],
  ])("rejects a malformed WAV header even with a matching hash (offset %i)", async (offset, value) => {
    const original = file(0, 16000, 17);
    original.wav[offset] = value;
    original.descriptor.sha256 = createHash("sha256").update(original.wav).digest("hex");
    await expect(verifyRecordingOriginal(original.wav, original.descriptor)).rejects.toThrow("recording_wav_invalid");
  });

  it("rejects payload tampering, truncated bytes, and a metadata sample mismatch", async () => {
    const original = file(0, 16000, 17);
    const changed = original.wav.slice();
    changed[44] ^= 1;
    await expect(verifyRecordingOriginal(changed, original.descriptor)).rejects.toThrow("recording_hash_mismatch");
    await expect(verifyRecordingOriginal(original.wav.subarray(0, -2), original.descriptor)).rejects.toThrow("recording_wav_invalid");
    await expect(verifyRecordingOriginal(original.wav, { ...original.descriptor, sample_count: 15999, bytes: 32042 })).rejects.toThrow("recording_wav_invalid");
  });

  it("supports byte views with a nonzero buffer offset", async () => {
    const original = file(0, 73, -123);
    const padded = new Uint8Array(original.wav.length + 20);
    padded.set(original.wav, 10);
    await expect(verifyRecordingOriginal(padded.subarray(10, -10), original.descriptor)).resolves.toBeUndefined();
  });

  it("creates 60+1-second transcription parts from verified originals only", async () => {
    const first = file(0, fullSamples, 17);
    const next = file(1, fullSamples, -31);
    const manifest = { version: 1, segments: [first.descriptor, next.descriptor] };
    const result = await createRecordingTranscriptionPart(manifest, 0, first.wav, next.wav);
    expect(result).toMatchObject({ index: 0, startSeconds: 0, endSeconds: 61 });
    expect(validateAudioPart(result.wav, 61)).toBe(true);
    const view = new DataView(result.wav.buffer);
    expect(view.getInt16(44 + fullSamples * 2 - 2, true)).toBe(17);
    expect(view.getInt16(44 + fullSamples * 2, true)).toBe(-31);
    expect(result.wav.byteLength).toBe(1_952_044);
    const final = await createRecordingTranscriptionPart(manifest, 1, next.wav, null);
    expect(final).toMatchObject({ startSeconds: 60, endSeconds: 120 });
    expect(validateAudioPart(final.wav, 60)).toBe(true);
    expect(Buffer.compare(Buffer.from(final.wav), Buffer.from(next.wav))).toBe(0);
  });

  it("uses a short final boundary without padding silence", async () => {
    const first = file(0, fullSamples, 17);
    const last = file(1, 73, -31);
    const part = await createRecordingTranscriptionPart({ version: 1, segments: [first.descriptor, last.descriptor] }, 0, first.wav, last.wav);
    expect(part.endSeconds).toBe(60 + 73 / 16000);
    expect(part.wav.byteLength).toBe(44 + (fullSamples + 73) * 2);
  });

  it("requires the declared next segment and rejects corrupt boundary audio", async () => {
    const first = file(0, fullSamples, 17);
    const next = file(1, 73, -31);
    const manifest = { version: 1, segments: [first.descriptor, next.descriptor] };
    await expect(createRecordingTranscriptionPart(manifest, 0, first.wav, null)).rejects.toThrow("recording_boundary_invalid");
    await expect(createRecordingTranscriptionPart(manifest, 1, next.wav, first.wav)).rejects.toThrow("recording_boundary_invalid");
    await expect(createRecordingTranscriptionPart(manifest, 2, next.wav, null)).rejects.toThrow("recording_boundary_invalid");
    next.wav[44] ^= 1;
    await expect(createRecordingTranscriptionPart(manifest, 0, first.wav, next.wav)).rejects.toThrow("recording_hash_mismatch");
  });

  it("does not copy caller mutations made while asynchronous verification is in progress", async () => {
    const original = file(0, 73, 17);
    const pending = createRecordingTranscriptionPart({ version: 1, segments: [original.descriptor] }, 0, original.wav, null);
    original.wav[44] ^= 1;
    const part = await pending;
    expect(new DataView(part.wav.buffer).getInt16(44, true)).toBe(17);
    await expect(verifyRecordingOriginal(part.wav, original.descriptor)).resolves.toBeUndefined();
  });
});
