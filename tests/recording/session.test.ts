import { describe, expect, it, vi } from "vitest";
import { RecordingSession, type Checkpoint } from "@/lib/recording/session";

const second = () => new Float32Array(16000).fill(0.25);
const drain = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

describe("meeting recording checkpoints", () => {
  it("acknowledges only committed samples and flushes the final partial second", async () => {
    const frames: Checkpoint[] = [];
    let commit!: () => void;
    const session = new RecordingSession(16000, async (frame) => {
      frames.push(frame);
      if (frame.sequence === 0) await new Promise<void>((resolve) => { commit = resolve; });
    });
    session.push(second());
    await drain();
    expect(session.snapshot().persistedSamples).toBe(0);
    commit();
    await drain();
    session.push(new Float32Array(73));
    await session.stop();
    expect(session.snapshot()).toMatchObject({ state: "stopped", samples: 16073, persistedSamples: 16073 });
    expect(frames.map((f) => [f.sequence, f.pcm.length])).toEqual([[0, 16000], [1, 73]]);
  });

  it("excludes pauses and refuses resume after interruption", async () => {
    const frames: Checkpoint[] = [];
    const session = new RecordingSession(16000, async (frame) => { frames.push(frame); });
    session.push(second());
    session.pause();
    session.push(second());
    session.resume();
    session.push(second());
    await session.interrupt("input_ended");
    expect(session.snapshot()).toMatchObject({ samples: 32000, persistedSamples: 32000, state: "interrupted", reason: "input_ended" });
    expect(() => session.resume()).toThrow("recording_not_paused");
  });

  it("interrupts at a five-second backlog and does not grow the queue", async () => {
    let resolve!: () => void;
    const session = new RecordingSession(16000, () => new Promise<void>((r) => { resolve = r; }));
    session.push(second());
    await drain();
    for (let i = 0; i < 100; i++) session.push(second());
    await drain();
    expect(session.snapshot()).toMatchObject({ state: "interrupted", reason: "storage_backlog", persistedSamples: 0 });
    expect(session.snapshot().samples).toBeLessThanOrEqual(5 * 16000);
    resolve();
    await session.stop();
  });

  it("fails closed on quota errors and never acknowledges later queued frames", async () => {
    const persist = vi.fn().mockRejectedValue(new DOMException("", "QuotaExceededError"));
    const session = new RecordingSession(16000, persist);
    session.push(second());
    session.push(second());
    await session.stop();
    expect(session.snapshot()).toMatchObject({ state: "interrupted", reason: "storage_failed", persistedSamples: 0 });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("bounds a stalled final checkpoint rather than spinning forever", async () => {
    vi.useFakeTimers();
    try {
      const session = new RecordingSession(16000, () => new Promise(() => {}));
      session.push(second());
      const stopping = session.stop();
      await vi.advanceTimersByTimeAsync(6000);
      await stopping;
      expect(session.snapshot()).toMatchObject({ state: "interrupted", reason: "storage_failed" });
    } finally { vi.useRealTimers(); }
  });

  it("streams 30 minutes with exactly 1800 bounded checkpoints and ignores further input", async () => {
    let frames = 0;
    let largest = 0;
    const session = new RecordingSession(16000, async ({ pcm, sequence }) => {
      expect(sequence).toBe(frames++);
      largest = Math.max(largest, pcm.byteLength);
    });
    for (let i = 0; i < 1801; i++) {
      session.push(second());
      await drain();
      if (i === 1739) expect(session.snapshot().warning).toBe(true);
    }
    await session.stop();
    expect(session.snapshot()).toMatchObject({ samples: 28_800_000, persistedSamples: 28_800_000, state: "stopped", reason: "duration_limit" });
    expect(frames).toBe(1800);
    expect(largest).toBe(32000);
  });
});
