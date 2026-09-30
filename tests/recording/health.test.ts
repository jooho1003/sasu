import { describe, expect, it } from "vitest";
import { RecordingHealthClock } from "@/lib/recording/health";

describe("recording health clock", () => {
  it("excludes deliberate pauses but records missing captured time", () => {
    const clock = new RecordingHealthClock();
    clock.observe(1000, "recording", 0);
    clock.observe(2000, "recording", 16000);
    clock.observe(2000, "paused", 16000);
    clock.observe(7000, "paused", 16000);
    clock.observe(7000, "recording", 16000);
    expect(clock.maxGapMs()).toBe(0);
    clock.observe(9500, "interrupted", 24000);
    expect(clock.maxGapMs()).toBe(2000);
  });

  it("ignores clock regressions and clamps invalid sample counts", () => {
    const clock = new RecordingHealthClock();
    clock.observe(1000, "recording", 0);
    clock.observe(900, "recording", -1);
    expect(clock.maxGapMs()).toBe(0);
  });
});
