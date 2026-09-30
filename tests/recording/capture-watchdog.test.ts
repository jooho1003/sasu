import { describe, expect, it } from "vitest";
import { CaptureWatchdog } from "@/lib/recording/capture-watchdog";

describe("capture progress watchdog", () => {
  it("stops missing input even while worker timers continue to run", () => {
    const watchdog = new CaptureWatchdog(0);
    for (let now = 200; now < 5000; now += 200)
      expect(watchdog.observe(now, true)).toBeNull();
    expect(watchdog.observe(5000, true)).toBe("capture_input_stalled");
  });

  it("counts silent PCM as progress and never measures sound amplitude", () => {
    const watchdog = new CaptureWatchdog(0);
    for (let now = 200; now <= 60_000; now += 200)
      expect(watchdog.observe(now, true, 3200)).toBeNull();
  });

  it("detects an event-loop gap before accepting the first post-sleep packet", () => {
    const watchdog = new CaptureWatchdog(0);
    expect(watchdog.observe(200, true, 3200)).toBeNull();
    expect(watchdog.observe(6000, true, 3200)).toBe("capture_suspended");
  });

  it("allows a long explicit pause and grants a fresh input window on resume", () => {
    const watchdog = new CaptureWatchdog(0);
    watchdog.observe(200, true, 3200);
    expect(watchdog.observe(300, false)).toBeNull();
    expect(watchdog.observe(60_000, false)).toBeNull();
    expect(watchdog.observe(60_100, true)).toBeNull();
    for (let now = 60_300; now < 65_100; now += 200)
      expect(watchdog.observe(now, true)).toBeNull();
    expect(watchdog.observe(65_100, true)).toBe("capture_input_stalled");
  });

  it("does not let empty packets or a late packet conceal a stalled input", () => {
    const watchdog = new CaptureWatchdog(0);
    for (let now = 200; now < 5000; now += 200)
      expect(watchdog.observe(now, true, 0)).toBeNull();
    expect(watchdog.observe(5000, true, 3200)).toBe("capture_input_stalled");
  });
});
