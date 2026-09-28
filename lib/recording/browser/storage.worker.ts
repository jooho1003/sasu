import { RecordingSession } from "../session";
import { CaptureWatchdog } from "../capture-watchdog";
import { prepareRecordingStore, type RecordingScope } from "./storage";

const endpoint = self as unknown as { postMessage: (message: unknown) => void; onmessage: ((event: MessageEvent) => void) | null };
endpoint.onmessage = async ({ data }: MessageEvent<{ scope: RecordingScope; inputRate: number; port: MessagePort; recordingKey: CryptoKey }>) => {
  const { scope, inputRate, port, recordingKey } = data;
  let store: Awaited<ReturnType<typeof prepareRecordingStore>> | undefined;
  let session: RecordingSession | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let finishing = false;
  let inputSamples = 0;
  const update = () => endpoint.postMessage({ type: "snapshot", snapshot: session!.snapshot() });
  const finish = async (reason?: string) => {
    if (finishing || !session || !store) return;
    finishing = true;
    clearInterval(timer);
    if (reason) await session.interrupt(reason);
    else await session.stop();
    const snapshot = session.snapshot();
    try { await store.finish(scope, snapshot.samples, snapshot.state === "stopped"); }
    catch { snapshot.state = "interrupted"; snapshot.reason = "storage_failed"; }
    endpoint.postMessage({ type: "done", snapshot });
    store.close();
    port.close();
  };
  try {
    store = await prepareRecordingStore(scope, recordingKey);
    session = new RecordingSession(inputRate, (frame) => store!.append(scope, frame));
    const watchdog = new CaptureWatchdog(performance.now());
    timer = setInterval(() => {
      const failure = watchdog.observe(performance.now(), session!.snapshot().state === "recording");
      if (failure) { void finish(failure); return; }
      update();
      if (["stopped", "stopping", "interrupted"].includes(session!.snapshot().state)) void finish();
    }, 200);
    port.onmessage = ({ data: message }) => {
      if (finishing) return;
      if (message.type === "pcm") {
        const failure = watchdog.observe(performance.now(), session!.snapshot().state === "recording", message.pcm.length);
        if (failure) { void finish(failure); return; }
        session!.push(message.pcm);
        inputSamples += message.pcm.length;
        port.postMessage({ type: "ack", samples: inputSamples });
      } else if (message.type === "pause" && session!.snapshot().state === "recording") {
        session!.pause();
        void store!.markPaused(scope).catch(() => { void finish("storage_failed"); });
      }
      else if (message.type === "resume" && session!.snapshot().state === "paused") session!.resume();
      else if (message.type === "stop") void finish();
      else if (message.type === "interrupt") void finish(message.reason);
      watchdog.observe(performance.now(), session!.snapshot().state === "recording");
      update();
    };
    port.start();
    endpoint.postMessage({ type: "ready" });
  } catch (error) {
    clearInterval(timer);
    store?.close();
    port.close();
    endpoint.postMessage({ type: "error", reason: error instanceof Error && error.message === "storage_space_insufficient"
      ? "storage_space_insufficient" : "recording_storage_unavailable" });
  }
};
