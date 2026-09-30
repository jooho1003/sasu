import { describe, expect, it } from "vitest";
import { combineRecordingOriginals } from "@/lib/recording/original-segments";
import { pcmWav, RECORDING_RATE } from "@/lib/recording/pcm";

function wav(samples: number, value: number) {
  return new Uint8Array(pcmWav(new Int16Array(samples).fill(value)));
}

describe("combined recording original download", () => {
  it("joins verified canonical segments into one WAV without boundary overlap", async () => {
    const first = wav(RECORDING_RATE * 60, 1234);
    const last = wav(RECORDING_RATE, -2345);
    const blob = await combineRecordingOriginals([first, last], RECORDING_RATE * 61, 2);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const header = new DataView(bytes.buffer);
    expect(blob.type).toBe("audio/wav");
    expect(bytes.length).toBe(44 + RECORDING_RATE * 61 * 2);
    expect(header.getUint32(4, true)).toBe(bytes.length - 8);
    expect(header.getUint32(40, true)).toBe(bytes.length - 44);
    expect(header.getInt16(44, true)).toBe(1234);
    expect(header.getInt16(44 + first.length - 44, true)).toBe(-2345);
  });

  it("rejects a missing segment, bad RIFF header, or wrong declared length", async () => {
    const full = wav(RECORDING_RATE * 60, 1);
    const short = wav(RECORDING_RATE, 2);
    await expect(combineRecordingOriginals([full], RECORDING_RATE * 61, 2)).rejects.toThrow("recording_bundle_invalid");
    await expect(combineRecordingOriginals([short, full], RECORDING_RATE * 61, 2)).rejects.toThrow("recording_bundle_invalid");
    const corrupt = new Uint8Array(short);
    corrupt[0] = 0;
    await expect(combineRecordingOriginals([corrupt], RECORDING_RATE, 1)).rejects.toThrow("recording_wav_invalid");
    await expect(combineRecordingOriginals([short], RECORDING_RATE - 1, 1)).rejects.toThrow("recording_bundle_invalid");
  });
});
