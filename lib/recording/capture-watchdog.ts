type CaptureFailure = "capture_input_stalled" | "capture_suspended";
const MAX_GAP_MS = 5000;

/** Counts incoming samples, not their amplitude. Silence is valid input.
 * Call before accepting PCM so a post-suspension packet cannot hide the gap.
 * The caller supplies a monotonic clock and stops capture on a failure.
 */
export class CaptureWatchdog {
  private lastObservation: number;
  private lastInput: number;
  private recording = true;

  constructor(now: number) {
    this.lastObservation = now;
    this.lastInput = now;
  }

  observe(now: number, recording: boolean, receivedSamples = 0): CaptureFailure | null {
    const gap = now - this.lastObservation;
    this.lastObservation = now;
    if (!recording || !this.recording) {
      this.recording = recording;
      this.lastInput = now;
      return null;
    }
    if (gap > MAX_GAP_MS) return "capture_suspended";
    if (now - this.lastInput >= MAX_GAP_MS) return "capture_input_stalled";
    if (receivedSamples > 0) this.lastInput = now;
    return null;
  }
}
