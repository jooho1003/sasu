export const MAX_REVIEW_AUDIO_BYTES = 50 * 1024 * 1024;
export const MAX_REVIEW_AUDIO_SECONDS = 1800;
export const AUDIO_PART_SECONDS = 60;

export function validateAudioMetadata(bytes: number, seconds: number): boolean {
  return (
    Number.isFinite(bytes) &&
    bytes > 0 &&
    bytes <= MAX_REVIEW_AUDIO_BYTES &&
    Number.isFinite(seconds) &&
    seconds > 0 &&
    seconds <= MAX_REVIEW_AUDIO_SECONDS
  );
}
export function audioPlan(
  duration: number,
): { index: number; start: number; end: number }[] {
  if (!validateAudioMetadata(1, duration))
    throw new Error("audio_duration_invalid");
  return Array.from(
    { length: Math.ceil(duration / AUDIO_PART_SECONDS) },
    (_, index) => ({
      index,
      start: index * AUDIO_PART_SECONDS,
      end: Math.min(duration, (index + 1) * AUDIO_PART_SECONDS + 1),
    }),
  );
}
export function encodeMonoWav(
  samples: Float32Array,
  sampleRate: number,
): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    const s = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
  });
  return buffer;
}
export function validateAudioPart(bytes: Uint8Array, seconds: number): boolean {
  if (bytes.length < 44 || seconds <= 0 || seconds > 61) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const label = (start: number, end: number) =>
    new TextDecoder().decode(bytes.slice(start, end));
  return (
    label(0, 4) === "RIFF" &&
    label(8, 12) === "WAVE" &&
    label(12, 16) === "fmt " &&
    label(36, 40) === "data" &&
    view.getUint16(20, true) === 1 &&
    view.getUint16(22, true) === 1 &&
    view.getUint32(24, true) === 16000 &&
    view.getUint16(34, true) === 16 &&
    view.getUint32(40, true) === bytes.length - 44 &&
    Math.abs((bytes.length - 44) / 32000 - seconds) < 0.001
  );
}
