import { MAX_RECORDING_SAMPLES, PcmResampler, RECORDING_RATE } from "./pcm";

export type Checkpoint = { sequence: number; pcm: Int16Array<ArrayBuffer> };
export type RecordingSnapshot = {
  state: "recording" | "paused" | "stopping" | "stopped" | "interrupted";
  samples: number;
  persistedSamples: number;
  reason: string | null;
  warning: boolean;
};

/** Runs in the storage worker. At most five seconds of PCM may await commit. */
export class RecordingSession {
  private readonly resampler: PcmResampler;
  private state: RecordingSnapshot["state"] = "recording";
  private reason: string | null = null;
  private samples = 0;
  private persistedSamples = 0;
  private sequence = 0;
  private frame = new Int16Array(RECORDING_RATE);
  private used = 0;
  private queue = Promise.resolve();
  private discardQueue = false;

  constructor(inputRate: number, private readonly persist: (frame: Checkpoint) => Promise<void>) {
    this.resampler = new PcmResampler(inputRate);
  }

  snapshot(): RecordingSnapshot {
    return { state: this.state, samples: this.samples, persistedSamples: this.persistedSamples,
      reason: this.reason, warning: this.samples >= RECORDING_RATE * 1740 };
  }

  push(input: Float32Array): void {
    if (this.state !== "recording") return;
    // Capture packets are bounded even if a caller bypasses the AudioWorklet.
    if (input.length > this.resampler.inputRate) {
      void this.interrupt("capture_packet_invalid");
      return;
    }
    const pcm = this.resampler.push(input);
    for (const sample of pcm) {
      if (this.samples - this.persistedSamples >= RECORDING_RATE * 5) {
        this.discardQueue = true;
        void this.interrupt("storage_backlog");
        break;
      }
      this.frame[this.used++] = sample;
      this.samples++;
      if (this.used === RECORDING_RATE) this.flush();
      if (this.samples === MAX_RECORDING_SAMPLES) {
        this.reason = "duration_limit";
        void this.stop();
        break;
      }
    }
  }

  private flush(): void {
    if (!this.used) return;
    const frame: Checkpoint = { sequence: this.sequence++, pcm: this.frame.slice(0, this.used) };
    this.used = 0;
    this.queue = this.queue.then(async () => {
      if (this.discardQueue) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          this.persist(frame),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("storage_timeout")), 5000); }),
        ]);
        this.persistedSamples += frame.pcm.length;
      } catch {
        this.discardQueue = true;
        this.state = "interrupted";
        this.reason = "storage_failed";
      } finally { clearTimeout(timer); }
    });
  }

  pause(): void {
    if (this.state !== "recording") throw new Error("recording_not_active");
    this.state = "paused";
  }

  resume(): void {
    if (this.state !== "paused") throw new Error("recording_not_paused");
    this.state = "recording";
  }

  async interrupt(reason: string): Promise<void> {
    if (this.state === "stopped" || this.state === "interrupted") return this.queue;
    this.state = "interrupted";
    this.reason = reason;
    this.flush();
    await this.queue;
  }

  async stop(): Promise<void> {
    if (this.state === "stopped") return;
    if (this.state !== "interrupted") this.state = "stopping";
    this.flush();
    await this.queue;
    if (this.state === "stopping") this.state = "stopped";
  }
}
