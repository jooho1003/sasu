import { describe, expect, it } from "vitest";
import { encodeRecordingLevels, quantizeRecordingLevel, recordingInputSide } from "@/lib/recording/levels";
import { RecordingCaptureMetadata } from "@/lib/contracts";

describe("one-byte recording level profile", () => {
  it("bounds RMS samples and encodes one byte per input per recorded second", () => {
    expect(quantizeRecordingLevel(0)).toBe(0);
    expect(quantizeRecordingLevel(1)).toBe(255);
    expect(quantizeRecordingLevel(Number.NaN)).toBe(0);
    const profile = encodeRecordingLevels([[200, 10], [201, 9], [199, 11]]);
    expect(atob(profile.microphone)).toHaveLength(3);
    expect(atob(profile.system!)).toHaveLength(3);
    expect(encodeRecordingLevels([[100], [110]]).system).toBeNull();
  });

  it("labels only a clear 12 dB input dominance inside a transcript range", () => {
    const profile = encodeRecordingLevels([[40, 200], [40, 200], [200, 40], [120, 120]]);
    expect(recordingInputSide(profile, 0, 2)).toBe("마이크 측");
    expect(recordingInputSide(profile, 2, 3)).toBe("상대 측");
    expect(recordingInputSide(profile, 3, 4)).toBeNull();
    expect(recordingInputSide({ microphone: "", system: null }, 0, 2)).toBeNull();
  });

  it("accepts bounded capture telemetry without widening the legacy capture shape", () => {
    const base = { paused: false, interrupted: false, captured_samples: 16000 };
    expect(RecordingCaptureMetadata.safeParse(base).success).toBe(true);
    expect(RecordingCaptureMetadata.safeParse({ ...base, levels: { microphone: "AQ==", system: null },
      clipping_ratio: 0.02, health: { checkpoint_delays: 1, max_pending_samples: 2000,
        backlog_stops: 0, max_sample_wall_gap_ms: 250, microphone_reselects: 1 } }).success).toBe(true);
    expect(RecordingCaptureMetadata.safeParse({ ...base, clipping_ratio: 2 }).success).toBe(false);
  });
});
