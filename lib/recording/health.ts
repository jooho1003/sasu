import { RECORDING_RATE } from "./pcm";
import type { RecordingSnapshot } from "./session";

/** Compares retained audio time with active wall time; deliberate pauses do not count. */
export class RecordingHealthClock {
  private startedAt: number | null = null;
  private observedAt = 0;
  private pausedAt: number | null = null;
  private pausedTotal = 0;
  private gap = 0;

  observe(now: number, state: RecordingSnapshot["state"], samples: number): void {
    if (!Number.isFinite(now) || !Number.isInteger(samples) || samples < 0 ||
      (this.startedAt !== null && now < this.observedAt)) return;
    if (this.startedAt === null) this.startedAt = now - samples / RECORDING_RATE * 1000;
    if (this.pausedAt !== null && state !== "paused") {
      this.pausedTotal += now - this.pausedAt;
      this.pausedAt = null;
    }
    if (state === "paused" && this.pausedAt === null) this.pausedAt = now;
    this.observedAt = now;
    const activeMs = now - this.startedAt - this.pausedTotal - (this.pausedAt === null ? 0 : now - this.pausedAt);
    const audioMs = samples / RECORDING_RATE * 1000;
    this.gap = Math.max(this.gap, Math.max(0, Math.round(activeMs - audioMs)));
  }

  maxGapMs(): number { return this.gap; }
}
