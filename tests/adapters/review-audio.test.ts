import { describe, expect, it } from "vitest";
import {
  audioPlan,
  encodeMonoWav,
  validateAudioMetadata,
  validateAudioPart,
} from "@/lib/adapters/review-audio";

describe("전체 음성 구간 처리", () => {
  it("마지막 짧은 구간도 포함하고 경계 1초는 겹쳐 확인한다", () => {
    expect(audioPlan(125)).toEqual([
      { index: 0, start: 0, end: 61 },
      { index: 1, start: 60, end: 121 },
      { index: 2, start: 120, end: 125 },
    ]);
    expect(audioPlan(60)).toEqual([{ index: 0, start: 0, end: 60 }]);
  });
  it("길이/크기 초과·빈 파일·손상 메타데이터를 조용히 자르지 않고 거절한다", () => {
    for (const seconds of [0, NaN, Infinity, 1801])
      expect(() => audioPlan(seconds)).toThrow();
    expect(validateAudioMetadata(100 * 1024 * 1024 + 1, 30)).toBe(false);
    expect(validateAudioMetadata(1024, 90)).toBe(true);
  });
  it("16kHz mono PCM WAV를 정확한 크기·샘플값으로 만든다", () => {
    const wav = encodeMonoWav(new Float32Array([-1, 0, 1]), 16000);
    const view = new DataView(wav);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(48, true)).toBe(32767);
    expect(wav.byteLength).toBe(50);
  });
  it("서버에서 구간 길이·형식과 파일 실제 길이를 대조한다", () => {
    const wav = new Uint8Array(encodeMonoWav(new Float32Array(16000), 16000));
    expect(validateAudioPart(wav, 1)).toBe(true);
    expect(validateAudioPart(wav, 2)).toBe(false);
    expect(validateAudioPart(wav.slice(0, 100), 1)).toBe(false);
    expect(validateAudioMetadata(50 * 1024 * 1024 + 1, 30)).toBe(false);
  });
});
