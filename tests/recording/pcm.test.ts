import { describe, expect, it } from "vitest";
import { PcmResampler, pcmWav, RECORDING_RATE, mixingGain } from "@/lib/recording/pcm";

describe("streaming meeting PCM", () => {
  it("bounds microphone plus system mixing without doubling the peak", () => {
    expect(mixingGain(1)).toBe(1);
    expect(mixingGain(2)).toBe(0.5);
    for (const inputs of [0, 3, NaN, 1.5]) expect(() => mixingGain(inputs)).toThrow("recording_input_count_invalid");
  });
  it.each([16000, 44100, 48000, 96000])("preserves exact duration at %i Hz across render quanta", (rate) => {
    const pcm = new PcmResampler(rate);
    let count = 0;
    for (let offset = 0; offset < rate * 3; offset += 128) {
      const out = pcm.push(new Float32Array(Math.min(128, rate * 3 - offset)).fill(0.5));
      count += out.length;
      for (const value of out) expect(value).toBe(16384);
    }
    expect(count).toBe(RECORDING_RATE * 3);
  });

  it("does not change samples at chunk boundaries", () => {
    const input = Float32Array.from({ length: 44107 }, (_, i) => Math.sin(i / 13));
    const whole = new PcmResampler(44100).push(input);
    const split = new PcmResampler(44100);
    const output: number[] = [];
    for (let i = 0; i < input.length; i += 127) output.push(...split.push(input.subarray(i, i + 127)));
    expect(output).toEqual(Array.from(whole));
  });

  it("clips mixed input, replaces non-finite samples, and rejects unsupported rates", () => {
    expect(Array.from(new PcmResampler(16000).push(new Float32Array([-2, 2, NaN, Infinity])))).toEqual([-32768, 32767, 0, 0]);
    for (const rate of [0, 8000, NaN, Infinity, 44100.5]) expect(() => new PcmResampler(rate)).toThrow("sample_rate_invalid");
  });

  it("encodes an independently playable little-endian PCM WAV without requantization", () => {
    const wav = pcmWav(new Int16Array([-32768, 0, 32767]));
    const view = new DataView(wav);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(42);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(48, true)).toBe(32767);
  });
});
