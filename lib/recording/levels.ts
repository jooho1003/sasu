export type RecordingLevels = { microphone: string; system: string | null };

/** Logarithmic RMS mapping: byte 1 is -72 dBFS, 255 is 0 dBFS; 0 is silence. */
export function quantizeRecordingLevel(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) return 0;
  const db = Math.max(-72, Math.min(0, 20 * Math.log10(rms)));
  return Math.max(1, Math.min(255, Math.round((db + 72) * 255 / 72)));
}

export function encodeRecordingLevels(vectors: number[][]): RecordingLevels {
  if (vectors.length > 1800 || vectors.some((vector) => vector.length !== vectors[0]?.length ||
    ![1, 2].includes(vector.length) || vector.some((value) => !Number.isInteger(value) || value < 0 || value > 255)))
    throw new Error("recording_levels_invalid");
  const microphone = vectors.map((vector) => vector[vector.length - 1]);
  const system = vectors[0]?.length === 2 ? vectors.map((vector) => vector[0]) : null;
  return { microphone: btoa(String.fromCharCode(...microphone)),
    system: system ? btoa(String.fromCharCode(...system)) : null };
}

export function recordingInputSide(profile: RecordingLevels, startSeconds: number, endSeconds: number):
  "마이크 측" | "상대 측" | null {
  if (!profile.system || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) ||
    startSeconds < 0 || endSeconds <= startSeconds) return null;
  try {
    const microphone = atob(profile.microphone);
    const system = atob(profile.system);
    if (!microphone.length || microphone.length !== system.length || microphone.length > 1800) return null;
    let difference = 0;
    let measured = 0;
    for (let index = Math.floor(startSeconds); index < Math.ceil(endSeconds) && index < microphone.length; index++) {
      const mic = microphone.charCodeAt(index);
      const shared = system.charCodeAt(index);
      if (!mic && !shared) continue;
      difference += mic - shared;
      measured++;
    }
    if (!measured) return null;
    const db = difference / measured * 72 / 255;
    return db >= 12 ? "마이크 측" : db <= -12 ? "상대 측" : null;
  } catch { return null; }
}
