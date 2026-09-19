import { RecordingSession } from "../session";
import { openRecordingStore, type RecordingScope } from "./storage";

const endpoint = self as unknown as { postMessage: (message: unknown) => void; onmessage: ((event: MessageEvent) => void) | null };
endpoint.onmessage = async ({ data }: MessageEvent<{ scope: RecordingScope; inputRate: number; port: MessagePort }>) => {
  const { scope, inputRate, port } = data;
  let store: Awaited<ReturnType<typeof openRecordingStore>> | undefined;
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
    const estimate = await navigator.storage.estimate();
    if (estimate.quota !== undefined && estimate.usage !== undefined && estimate.quota - estimate.usage < 64 * 1024 * 1024)
      throw new Error("storage_space_insufficient");
    store = await openRecordingStore();
    await store.cleanup(scope.ownerUserId);
    await store.create(scope);
    session = new RecordingSession(inputRate, (frame) => store!.append(scope, frame));
    let heartbeat = Date.now();
    timer = setInterval(() => {
      const now = Date.now();
      if (now - heartbeat > 5000) void finish("capture_suspended");
      heartbeat = now;
      update();
      if (["stopped", "stopping", "interrupted"].includes(session!.snapshot().state)) void finish();
    }, 200);
    port.onmessage = ({ data: message }) => {
      if (finishing) return;
      if (message.type === "pcm") {
        session!.push(message.pcm);
        inputSamples += message.pcm.length;
        port.postMessage({ type: "ack", samples: inputSamples });
      } else if (message.type === "pause" && session!.snapshot().state === "recording") session!.pause();
      else if (message.type === "resume" && session!.snapshot().state === "paused") session!.resume();
      else if (message.type === "stop") void finish();
      else if (message.type === "interrupt") void finish(message.reason);
      update();
    };
    port.start();
    endpoint.postMessage({ type: "ready" });
  } catch {
    clearInterval(timer);
    store?.close();
    port.close();
    endpoint.postMessage({ type: "error", reason: "recording_storage_unavailable" });
  }
};
