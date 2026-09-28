import { expect, test } from "@playwright/test";

type Lab = typeof import("../../lib/recording/browser/storage") &
  typeof import("../../lib/recording/checkpoint-crypto") & { createStorageWorker: () => Worker };

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("검증 준비 완료");
});

test("input starvation ends the real worker and preserves its final encrypted partial second", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: Lab }).recordingLab;
    const recordingKey = await lab.importRecordingKey(new Uint8Array(32).fill(42));
    const scope = { ownerUserId: "worker-test", deptId: "synthetic", recordingId: "input-stalled" };
    const worker = lab.createStorageWorker();
    const channel = new MessageChannel();
    const terminal = await new Promise<{ type: string; snapshot?: { state: string; reason: string; samples: number; persistedSamples: number } }>((resolve) => {
      const deadline = setTimeout(() => resolve({ type: "deadline" }), 8000);
      worker.onmessage = ({ data }) => {
        if (data.type === "ready") channel.port2.postMessage({ type: "pcm", pcm: new Float32Array(8000).fill(0.25) });
        if (["done", "error"].includes(data.type)) { clearTimeout(deadline); resolve(data); }
      };
      worker.postMessage({ scope, inputRate: 16000, port: channel.port1, recordingKey }, [channel.port1]);
    });
    worker.terminate();
    channel.port2.close();
    const store = await lab.openRecordingStore(recordingKey);
    try {
      const recovery = await store.inspect(scope);
      const frames: number[][] = [];
      for await (const frame of store.read(scope)) frames.push([frame.sequence, frame.pcm.length, frame.pcm[0]]);
      return { terminal, recovery, frames };
    } finally { store.close(); }
  });
  expect(result.terminal).toMatchObject({ type: "done", snapshot: {
    state: "interrupted", reason: "capture_input_stalled", samples: 8000, persistedSamples: 8000,
  } });
  expect(result.recovery).toMatchObject({ samples: 8000, interrupted: true, partial: false });
  expect(result.frames).toEqual([[0, 8000, 8192]]);
});

test("an intentional pause longer than the watchdog window resumes without a false interruption", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: Lab }).recordingLab;
    const recordingKey = await lab.importRecordingKey(new Uint8Array(32).fill(42));
    const worker = lab.createStorageWorker();
    const channel = new MessageChannel();
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;
    const result = await new Promise<{ type: string; snapshot?: { state: string; samples: number; persistedSamples: number } }>((resolve) => {
      const deadline = setTimeout(() => resolve({ type: "deadline" }), 10_000);
      worker.onmessage = ({ data }) => {
        if (data.type === "ready") {
          channel.port2.postMessage({ type: "pcm", pcm: new Float32Array(8000) });
          channel.port2.postMessage({ type: "pause" });
          resumeTimer = setTimeout(() => {
            channel.port2.postMessage({ type: "resume" });
            channel.port2.postMessage({ type: "pcm", pcm: new Float32Array(8000) });
            channel.port2.postMessage({ type: "stop" });
          }, 5500);
        }
        if (["done", "error"].includes(data.type)) { clearTimeout(deadline); resolve(data); }
      };
      worker.postMessage({ scope: { ownerUserId: "worker-test", deptId: "synthetic", recordingId: "pause" },
        inputRate: 16000, port: channel.port1, recordingKey }, [channel.port1]);
    });
    clearTimeout(resumeTimer);
    worker.terminate();
    channel.port2.close();
    return result;
  });
  expect(result).toMatchObject({ type: "done", snapshot: { state: "stopped", samples: 16000, persistedSamples: 16000 } });
});

test("storage preflight round-trips encrypted samples and removes its probe before creating the recording", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: Lab }).recordingLab;
    const scope = { ownerUserId: "probe-test", deptId: "synthetic", recordingId: "ready" };
    const store = await lab.prepareRecordingStore(scope, await lab.importRecordingKey(new Uint8Array(32).fill(42)));
    const recovery = await store.inspect(scope);
    store.close();
    const rows = await new Promise<{ recordingIds: string[]; chunks: number }>((resolve, reject) => {
      const request = indexedDB.open("sasu-meeting-recordings", 2);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(["recordings", "chunks"], "readonly");
        const headers = tx.objectStore("recordings").getAll();
        const chunks = tx.objectStore("chunks").count();
        tx.oncomplete = () => {
          resolve({ recordingIds: headers.result.map((row) => row.recordingId), chunks: chunks.result });
          db.close();
        };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
      request.onerror = () => reject(request.error);
    });
    return { recovery, rows };
  });
  expect(result).toMatchObject({ recovery: { samples: 0, chunks: 0 }, rows: { recordingIds: ["ready"], chunks: 0 } });
});

test("a quota failure writing encrypted PCM prevents recording creation", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: Lab }).recordingLab;
    const recordingKey = await lab.importRecordingKey(new Uint8Array(32).fill(42));
    const scope = { ownerUserId: "probe-test", deptId: "synthetic", recordingId: "must-not-exist" };
    const original = IDBObjectStore.prototype.add;
    let chunkWrites = 0;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === "chunks") { chunkWrites++; throw new DOMException("Synthetic quota fault", "QuotaExceededError"); }
      return original.apply(this, args);
    };
    let rejected = false;
    try { (await lab.prepareRecordingStore(scope, recordingKey)).close(); }
    catch { rejected = true; }
    finally { IDBObjectStore.prototype.add = original; }
    const store = await lab.openRecordingStore(recordingKey);
    try { return { rejected, chunkWrites, recording: await store.inspect(scope) }; }
    finally { store.close(); }
  });
  expect(result).toEqual({ rejected: true, chunkWrites: 1, recording: null });
});

test("a decryption failure prevents ready and leaves no recording header", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: Lab }).recordingLab;
    const recordingKey = await lab.importRecordingKey(new Uint8Array(32).fill(42));
    const scope = { ownerUserId: "probe-test", deptId: "synthetic", recordingId: "decrypt-failure" };
    const original = crypto.subtle.decrypt;
    let decryptions = 0;
    crypto.subtle.decrypt = async () => { decryptions++; throw new DOMException("Synthetic authentication failure", "OperationError"); };
    let rejected = false;
    try { (await lab.prepareRecordingStore(scope, recordingKey)).close(); }
    catch { rejected = true; }
    finally { crypto.subtle.decrypt = original; }
    const store = await lab.openRecordingStore(recordingKey);
    try { return { rejected, decryptions, recording: await store.inspect(scope) }; }
    finally { store.close(); }
  });
  expect(result).toEqual({ rejected: true, decryptions: 1, recording: null });
});

test("worker initialization with an unusable encryption key never signals ready", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: Lab }).recordingLab;
    const recordingKey = await crypto.subtle.importKey("raw", new Uint8Array(32), "AES-GCM", false, ["decrypt"]);
    const scope = { ownerUserId: "worker-test", deptId: "synthetic", recordingId: "invalid-key" };
    const worker = lab.createStorageWorker();
    const channel = new MessageChannel();
    let ready = false;
    const terminal = await new Promise<{ type: string; reason?: string }>((resolve) => {
      const deadline = setTimeout(() => resolve({ type: "deadline" }), 8000);
      worker.onmessage = ({ data }) => {
        if (data.type === "ready") ready = true;
        if (["ready", "error"].includes(data.type)) { clearTimeout(deadline); resolve(data); }
      };
      worker.postMessage({ scope, inputRate: 16000, port: channel.port1, recordingKey }, [channel.port1]);
    });
    worker.terminate();
    channel.port2.close();
    const store = await lab.openRecordingStore(recordingKey);
    try { return { ready, terminal, recording: await store.inspect(scope) }; }
    finally { store.close(); }
  });
  expect(result).toEqual({ ready: false, terminal: { type: "error", reason: "recording_storage_unavailable" }, recording: null });
});
