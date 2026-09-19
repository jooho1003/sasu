export const RECORDING_RATE = 16000;
export const MAX_RECORDING_SAMPLES = RECORDING_RATE * 1800;

export function mixingGain(inputCount: number): number {
  if (inputCount !== 1 && inputCount !== 2) throw new Error("recording_input_count_invalid");
  return 1 / inputCount;
}

/** Streaming area resampling. Integer phase units avoid 44.1kHz drift.
 * The box prefilter preserves speech/DC and bounds memory; listening quality,
 * especially above the voice band, remains part of the hardware validation.
 */
export class PcmResampler {
  private weight = 0;
  private sum = 0;

  constructor(readonly inputRate: number) {
    if (!Number.isInteger(inputRate) || inputRate < RECORDING_RATE || inputRate > 192000)
      throw new Error("sample_rate_invalid");
  }

  push(input: Float32Array): Int16Array<ArrayBuffer> {
    const output = new Int16Array(Math.floor((this.weight + input.length * RECORDING_RATE) / this.inputRate));
    let index = 0;
    for (const raw of input) {
      const value = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0;
      let remaining = RECORDING_RATE;
      while (remaining > 0) {
        const used = Math.min(remaining, this.inputRate - this.weight);
        this.sum += value * used;
        this.weight += used;
        remaining -= used;
        if (this.weight === this.inputRate) {
          const sample = this.sum / this.inputRate;
          output[index++] = Math.round(sample * (sample < 0 ? 32768 : 32767));
          this.sum = 0;
          this.weight = 0;
        }
      }
    }
    return output;
  }
}

export function pcmWav(pcm: Int16Array): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  for (const [offset, label] of [[0, "RIFF"], [8, "WAVE"], [12, "fmt "], [36, "data"]] as const)
    for (let i = 0; i < label.length; i++) view.setUint8(offset + i, label.charCodeAt(i));
  view.setUint32(4, buffer.byteLength - 8, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RECORDING_RATE, true);
  view.setUint32(28, RECORDING_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(40, pcm.byteLength, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, pcm[i], true);
  return buffer;
}
