import { stopInputs } from "./inputs";
import { mixingGain } from "../pcm";
import type { RecordingSnapshot } from "../session";
import { acquireCaptureLock, type RecordingScope } from "./storage";

/** Technical gate only. App callers must revalidate session/membership/consent
 * before capture or recovery; this module makes no authorization decision.
 */
export async function startRecording(scope: RecordingScope, inputs: MediaStream[], recordingKey: CryptoKey,
  onSnapshot: (snapshot: RecordingSnapshot) => void) {
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
  const cleanup = () => {
    ending = true;
    clearTimeout(stopTimer);
    stopInputs(inputs);
    node?.disconnect();
    node?.port.close();
    worker?.terminate();
    if (context && context.state !== "closed") void context.close().catch(() => {});
    release?.();
    release = undefined;
    resolveDone();
  };
  const end = (reason?: string) => {
    if (ending) return done;
    ending = true;
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
    worker.onmessage = ({ data }) => {
      if (data.snapshot) { lastSnapshot = data.snapshot; onSnapshot(lastSnapshot); }
      if (data.type === "done" || data.type === "error") cleanup();
    };
    worker.onerror = () => {
      onSnapshot({ ...lastSnapshot, state: "interrupted", reason: "capture_worker_failed" });
      cleanup();
    };
    node.port.onmessage = ({ data }) => { if (data.type === "interrupt") void end(data.reason); };
    node.onprocessorerror = () => { void end("capture_processor_failed"); };
    const meters: AnalyserNode[] = [];
    const mix = context.createGain();
    mix.gain.value = mixingGain(inputs.length);
    for (const input of inputs) {
      const source = context.createMediaStreamSource(input);
      const meter = context.createAnalyser();
      meter.fftSize = 256;
      source.connect(meter);
      meter.connect(mix);
      meters.push(meter);
      for (const track of input.getTracks()) track.addEventListener("ended", () => { void end("input_ended"); }, { once: true });
    }
    mix.connect(node);
    node.connect(context.destination);
    node.port.postMessage({ type: "connect", port: channel.port2 }, [channel.port2]);
    context.onstatechange = () => {
      if (!ending && context!.state !== "running") void end("capture_suspended");
    };
    // The user may have stopped sharing during asynchronous storage initialization.
    if (inputs.some((input) => input.getTracks().some((track) => track.readyState !== "live"))) void end("input_ended");
    return {
      pause: () => { if (!ending) node!.port.postMessage({ type: "pause" }); },
      resume: () => {
        if (inputs.some((input) => input.getTracks().some((track) => track.readyState !== "live"))) return end("input_ended");
        if (!ending) node!.port.postMessage({ type: "resume" });
      },
      stop: () => end(),
      interrupt: (reason: string) => end(reason),
      levels: () => meters.map((meter) => {
        const buffer = new Float32Array(meter.fftSize);
        meter.getFloatTimeDomainData(buffer);
        return Math.sqrt(buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length);
      }),
    };
  } catch (error) { cleanup(); throw error; }
}
