import { RecordingManifest, RecordingOriginalSegment } from "../contracts";
import { AUDIO_PART_SECONDS } from "../adapters/review-audio";
import { MAX_RECORDING_SAMPLES, pcmWav, RECORDING_RATE } from "./pcm";
import type { Checkpoint } from "./session";

const SEGMENT_SAMPLES = RECORDING_RATE * AUDIO_PART_SECONDS;
export type RecordingOriginalFile = {
  descriptor: RecordingOriginalSegment;
  wav: Uint8Array<ArrayBuffer>;
};

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function canonicalRecordingManifest(input: unknown): string {
  const manifest = RecordingManifest.parse(input);
  return "sasu-recording-manifest-v1\n" + manifest.segments.map((segment) =>
    `${segment.index}:${segment.sample_count}:${segment.bytes}:${segment.sha256}\n`,
  ).join("");
}

export async function recordingManifestFingerprint(input: unknown): Promise<string> {
  return sha256(new TextEncoder().encode(canonicalRecordingManifest(input)));
}

export function recordingManifestTotals(input: unknown) {
  const { segments } = RecordingManifest.parse(input);
  const samples = segments.reduce((sum, segment) => sum + segment.sample_count, 0);
  return { samples, bytes: segments.reduce((sum, segment) => sum + segment.bytes, 0), durationSeconds: samples / RECORDING_RATE };
}

async function originalFile(index: number, pcm: Int16Array): Promise<RecordingOriginalFile> {
  const wav = new Uint8Array(pcmWav(pcm));
  return { wav, descriptor: { index, sample_count: pcm.length, bytes: wav.byteLength, sha256: await sha256(wav) } };
}

/** One original at a time. Consumers must not retain all WAVs in memory.
 * A source error after a yield still rejects the bundle; only a fully consumed,
 * validated manifest can be used to declare the completed recording.
 */
export async function* streamRecordingOriginals(
  checkpoints: AsyncIterable<Checkpoint> | Iterable<Checkpoint>,
): AsyncGenerator<RecordingOriginalFile, void> {
  const pcm = new Int16Array(SEGMENT_SAMPLES);
  let sequence = 0;
  let segmentIndex = 0;
  let used = 0;
  let total = 0;
  let shortTail = false;
  for await (const checkpoint of checkpoints) {
    if (checkpoint.sequence !== sequence || sequence >= 1800 || shortTail ||
      !(checkpoint.pcm instanceof Int16Array) || checkpoint.pcm.length < 1 || checkpoint.pcm.length > RECORDING_RATE ||
      total + checkpoint.pcm.length > MAX_RECORDING_SAMPLES) throw new Error("recording_checkpoint_invalid");
    sequence++;
    shortTail = checkpoint.pcm.length < RECORDING_RATE;
    pcm.set(checkpoint.pcm, used);
    used += checkpoint.pcm.length;
    total += checkpoint.pcm.length;
    if (used === SEGMENT_SAMPLES) {
      yield await originalFile(segmentIndex++, pcm);
      used = 0;
    }
  }
  if (!total) throw new Error("recording_empty");
  if (used) yield await originalFile(segmentIndex, pcm.subarray(0, used));
}

/** A recovery reader may stop at the first corrupt checkpoint. Compare with
 * the already inspected continuous prefix instead of declaring that shorter
 * stream complete. Only descriptors, never the full WAV bundle, are retained.
 */
export async function prepareRecordingOriginalManifest(
  checkpoints: AsyncIterable<Checkpoint> | Iterable<Checkpoint>, expectedSamples: number,
) {
  if (!Number.isInteger(expectedSamples) || expectedSamples < 1 || expectedSamples > MAX_RECORDING_SAMPLES)
    throw new Error("recording_recovery_changed");
  const segments: RecordingOriginalSegment[] = [];
  let samples = 0;
  for await (const original of streamRecordingOriginals(checkpoints)) {
    samples += original.descriptor.sample_count;
    if (samples > expectedSamples) throw new Error("recording_recovery_changed");
    segments.push(original.descriptor);
  }
  if (samples !== expectedSamples) throw new Error("recording_recovery_changed");
  const manifest = RecordingManifest.parse({ version: 1, segments });
  return { manifest, fingerprint: await recordingManifestFingerprint(manifest) };
}

/** Strict canonical WAV validation, including fields the legacy upload path
 * tolerates. Hash equality alone does not establish the PCM format.
 */
export async function verifyRecordingOriginal(wav: Uint8Array, expected: RecordingOriginalSegment): Promise<void> {
  const segment = RecordingOriginalSegment.parse(expected);
  if (wav.byteLength !== segment.bytes) throw new Error("recording_wav_invalid");
  const bytes = new Uint8Array(wav);
  const view = new DataView(bytes.buffer);
  const label = (offset: number, value: string) => Array.from(value).every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  if (!label(0, "RIFF") || !label(8, "WAVE") || !label(12, "fmt ") || !label(36, "data") ||
    view.getUint32(4, true) !== bytes.length - 8 || view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || view.getUint32(24, true) !== RECORDING_RATE ||
    view.getUint32(28, true) !== RECORDING_RATE * 2 || view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16 ||
    view.getUint32(40, true) !== segment.sample_count * 2) throw new Error("recording_wav_invalid");
  if (await sha256(bytes) !== segment.sha256) throw new Error("recording_hash_mismatch");
}

/** Uses at most this original and its declared successor. A missing or invalid
 * successor fails the part; it is never replaced with silence or unchecked PCM.
 */
export async function createRecordingTranscriptionPart(
  input: unknown, index: number, currentWav: Uint8Array, nextWav: Uint8Array | null,
) {
  const manifest = RecordingManifest.parse(input);
  const current = manifest.segments[index];
  const next = manifest.segments[index + 1];
  if (!Number.isInteger(index) || !current || Boolean(next) !== (nextWav !== null))
    throw new Error("recording_boundary_invalid");
  if (currentWav.byteLength !== current.bytes || (next && nextWav?.byteLength !== next.bytes))
    throw new Error("recording_wav_invalid");
  // Snapshot inputs before either await; validated bytes cannot be swapped by a
  // caller while Web Crypto is running and then copied into the resulting part.
  const first = new Uint8Array(currentWav);
  const second = nextWav === null ? null : new Uint8Array(nextWav);
  await verifyRecordingOriginal(first, current);
  if (next && second) await verifyRecordingOriginal(second, next);
  const overlap = next ? Math.min(RECORDING_RATE, next.sample_count) : 0;
  const samples = current.sample_count + overlap;
  const wav = new Uint8Array(pcmWav(new Int16Array(samples)));
  wav.set(first.subarray(44), 44);
  if (second) wav.set(second.subarray(44, 44 + overlap * 2), first.byteLength);
  const startSeconds = index * AUDIO_PART_SECONDS;
  return { index, startSeconds, endSeconds: startSeconds + samples / RECORDING_RATE, wav };
}
