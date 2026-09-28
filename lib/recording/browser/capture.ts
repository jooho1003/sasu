import { stopInputs } from "./inputs";
import { mixingGain } from "../pcm";
import type { RecordingSnapshot } from "../session";
import { RecordingHealthClock } from "../health";
import { acquireCaptureLock, type RecordingScope } from "./storage";

/** Technical gate only. App callers must revalidate session/membership/consent
 * before capture or recovery; this module makes no authorization decision.
 */
export async function startRecording(scope: RecordingScope, inputs: MediaStream[], recordingKey: CryptoKey,
  onSnapshot: (snapshot: RecordingSnapshot) => void, onMicrophoneEnded: () => void = () => {}) {
  let release: (() => void) | undefined;
  let context: AudioContext | undefined;
  let worker: Worker | undefined;
  let node: AudioWorkletNode | undefined;
  let ending = false;
  let leaseLost = false;
  let lastSnapshot: RecordingSnapshot = { state: "recording", samples: 0, persistedSamples: 0, reason: null, warning: false };
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  let workerTimer: ReturnType<typeof setInterval> | undefined;
  let clippedSamples = 0;
  let measuredSamples = 0;
  let maxPendingSamples = 0;
  let checkpointDelays = 0;
  const healthClock = new RecordingHealthClock();
  const profileNodes: AudioWorkletNode[] = [];
  const inputProfiles: number[][] = inputs.map(() => []);
  const pauseCapture = () => {
    node?.port.postMessage({ type: "pause" });
    for (const profiler of profileNodes) profiler.port.postMessage({ type: "pause" });
  };
  const resumeCapture = () => {
    for (const profiler of profileNodes) profiler.port.postMessage({ type: "resume" });
    node?.port.postMessage({ type: "resume" });
  };
  const cleanup = () => {
    ending = true;
    clearTimeout(stopTimer);
    clearInterval(workerTimer);
    stopInputs(inputs);
    node?.disconnect();
    node?.port.close();
    for (const profiler of profileNodes) { profiler.disconnect(); profiler.port.close(); }
    worker?.terminate();
    if (context && context.state !== "closed") void context.close().catch(() => {});
    release?.();
    release = undefined;
    resolveDone();
  };
  const end = (reason?: string) => {
    if (ending) return done;
    ending = true;
    for (const profiler of profileNodes) profiler.port.postMessage({ type: "pause" });
    node!.port.postMessage(reason ? { type: "interrupt", reason } : { type: "stop" });
    stopInputs(inputs);
    stopTimer = setTimeout(() => {
      onSnapshot({ ...lastSnapshot, state: "interrupted", reason: "capture_worker_timeout" });
      cleanup();
    }, 7000);
    return done;
  };
  try {
    if (!inputs.length || inputs.some((input) => !input.getAudioTracks().some((track) => track.readyState === "live")))
      throw new Error("recording_input_missing");
    release = await acquireCaptureLock(() => { leaseLost = true; if (node) void end("capture_lease_lost"); });
    context = new AudioContext();
    await context.resume();
    await context.audioWorklet.addModule(new URL("./capture.worklet.js", import.meta.url).href);
    worker = new Worker(new URL("./storage.worker.ts", import.meta.url), { type: "module" });
    const channel = new MessageChannel();
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("recording_worker_timeout")), 10000);
      worker!.onerror = () => { clearTimeout(timeout); reject(new Error("recording_worker_failed")); };
      worker!.onmessage = ({ data }) => {
        if (data.type === "ready") { clearTimeout(timeout); resolve(); }
        if (data.type === "error") { clearTimeout(timeout); reject(new Error(data.reason)); }
      };
    worker!.postMessage({ scope, inputRate: context!.sampleRate, port: channel.port1, recordingKey }, [channel.port1]);
    });
    if (leaseLost) throw new Error("capture_lease_lost");
    node = new AudioWorkletNode(context, "sasu-meeting-capture");
    let lastWorkerMessage = performance.now();
    worker.onmessage = ({ data }) => {
      lastWorkerMessage = performance.now();
      if (typeof data.checkpointDelays === "number") checkpointDelays = data.checkpointDelays;
      if (data.snapshot) {
        lastSnapshot = data.snapshot;
        healthClock.observe(performance.now(), lastSnapshot.state, lastSnapshot.samples);
        onSnapshot(lastSnapshot);
      }
      else if (data.type === "error") {
        onSnapshot({ ...lastSnapshot, state: "interrupted", reason: "capture_worker_failed" });
      }
      if (data.type === "done" || data.type === "error") cleanup();
    };
    worker.onerror = () => {
      onSnapshot({ ...lastSnapshot, state: "interrupted", reason: "capture_worker_failed" });
      cleanup();
    };
    workerTimer = setInterval(() => {
      if (!ending && performance.now() - lastWorkerMessage >= 5000) {
        onSnapshot({ ...lastSnapshot, state: "interrupted", reason: "capture_worker_timeout" });
        cleanup();
      }
    }, 500);
    node.port.onmessage = ({ data }) => {
      if (data.type === "interrupt") void end(data.reason);
      if (data.type === "metrics") {
        clippedSamples += data.clipped;
        measuredSamples += data.total;
        maxPendingSamples = Math.max(maxPendingSamples, data.pending);
      }
    };
    node.onprocessorerror = () => { void end("capture_processor_failed"); };
    const meters: AnalyserNode[] = [];
    const sources: MediaStreamAudioSourceNode[] = [];
    const mix = context.createGain();
    mix.gain.value = mixingGain(inputs.length);
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    for (const [index, input] of inputs.entries()) {
      const source = context.createMediaStreamSource(input);
      const meter = context.createAnalyser();
      meter.fftSize = 256;
      source.connect(meter);
      meter.connect(mix);
      meters.push(meter);
      sources.push(source);
      const profiler = new AudioWorkletNode(context, "sasu-input-level");
      profiler.port.onmessage = ({ data }) => {
        if (data.type !== "level" || !Number.isInteger(data.second) || data.second < 1 || data.second > 1800 ||
          !Number.isFinite(data.rms) || data.rms < 0) return;
        inputProfiles[index][data.second - 1] = data.rms;
      };
      profiler.onprocessorerror = () => { void end("profile_processor_failed"); };
      source.connect(profiler);
      profiler.connect(context.destination);
      profileNodes.push(profiler);
      for (const track of input.getTracks()) track.addEventListener("ended", () => {
        if (ending || inputs[index] !== input) return;
        if (index === inputs.length - 1 && track.kind === "audio") {
          pauseCapture();
          onMicrophoneEnded();
        } else void end("input_ended");
      }, { once: true });
    }
    mix.connect(limiter);
    limiter.connect(node);
    node.connect(context.destination);
    for (const profiler of profileNodes) profiler.port.postMessage({ type: "start", second: 0 });
    node.port.postMessage({ type: "connect", port: channel.port2 }, [channel.port2]);
    context.onstatechange = () => {
      if (!ending && context!.state !== "running") void end("capture_suspended");
    };
    // The user may have stopped sharing during asynchronous storage initialization.
    if (inputs.some((input) => input.getTracks().some((track) => track.readyState !== "live"))) void end("input_ended");
    return {
      pause: () => { if (!ending) pauseCapture(); },
      resume: () => {
        if (inputs.some((input) => input.getTracks().some((track) => track.readyState !== "live"))) return end("input_ended");
        if (!ending) resumeCapture();
      },
      stop: () => end(),
      interrupt: (reason: string) => end(reason),
      async replaceMicrophone(microphone: MediaStream) {
        if (ending || !microphone.getAudioTracks().some((track) => track.readyState === "live"))
          throw new Error("microphone_missing");
        const index = inputs.length - 1;
        const old = inputs[index];
        const source = context!.createMediaStreamSource(microphone);
        const meter = context!.createAnalyser();
        meter.fftSize = 256;
        const profiler = new AudioWorkletNode(context!, "sasu-input-level");
        profiler.port.onmessage = ({ data }) => {
          if (data.type === "level" && Number.isInteger(data.second) && data.second >= 1 && data.second <= 1800 &&
            Number.isFinite(data.rms) && data.rms >= 0) inputProfiles[index][data.second - 1] = data.rms;
        };
        profiler.onprocessorerror = () => { void end("profile_processor_failed"); };
        source.connect(meter);
        meter.connect(mix);
        source.connect(profiler);
        profiler.connect(context!.destination);
        sources[index].disconnect();
        meters[index].disconnect();
        profileNodes[index].disconnect();
        profileNodes[index].port.close();
        profiler.port.postMessage({ type: "reset", second: inputProfiles[index].length });
        sources[index] = source;
        meters[index] = meter;
        profileNodes[index] = profiler;
        inputs[index] = microphone;
        stopInputs([old]);
        for (const track of microphone.getTracks()) track.addEventListener("ended", () => {
          if (ending || inputs[index] !== microphone) return;
          pauseCapture();
          onMicrophoneEnded();
        }, { once: true });
      },
      health: () => ({ clipping_ratio: measuredSamples ? clippedSamples / measuredSamples : 0,
        checkpoint_delays: checkpointDelays, max_pending_samples: maxPendingSamples,
        backlog_stops: ["capture_backlog", "storage_backlog"].includes(lastSnapshot.reason ?? "") ? 1 : 0,
        max_sample_wall_gap_ms: healthClock.maxGapMs() }),
      profile: () => Array.from({ length: Math.min(...inputProfiles.map((levels) => levels.length)) },
        (_, second) => inputProfiles.map((levels) => levels[second] ?? 0)),
      levels: () => meters.map((meter) => {
        const buffer = new Float32Array(meter.fftSize);
        meter.getFloatTimeDomainData(buffer);
        return Math.sqrt(buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length);
      }),
    };
  } catch (error) { cleanup(); throw error; }
}
