import { MAX_RECORDING_SAMPLES, RECORDING_RATE } from "../pcm";
import type { Checkpoint } from "../session";

// Synthetic technical gate only. SEC-06 encrypted storage and session key
// issuance must replace this format before any real recording integration.

export type RecordingScope = { ownerUserId: string; deptId: string; recordingId: string };
type Header = RecordingScope & { key: string[]; createdAt: number; samples: number; chunks: number; shortTail: boolean; complete: boolean; capturedSamples: number };
type StoredCheckpoint = RecordingScope & Checkpoint & { sha256: string };
const TTL = 24 * 60 * 60 * 1000;
const key = (scope: RecordingScope) => [scope.ownerUserId, scope.deptId, scope.recordingId];

function openDatabase(name: string, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(name, 1);
    const fail = () => { settled = true; clearTimeout(timer); reject(new Error("recording_storage_unavailable")); };
    const timer = setTimeout(fail, 5000);
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => {
      clearTimeout(timer);
      if (settled) { request.result.close(); return; }
      settled = true;
      resolve(request.result);
    };
    request.onerror = fail;
    request.onblocked = fail;
  });
}

async function digest(pcm: Int16Array<ArrayBuffer>): Promise<string> {
  const bytes = new Uint8Array(pcm.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < pcm.length; i++) view.setInt16(i * 2, pcm[i], true);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function transaction<T>(db: IDBDatabase, names: string[], mode: IDBTransactionMode,
  run: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode, { durability: "strict" });
    let result: T;
    const timeout = setTimeout(() => { try { tx.abort(); } catch { /* already closed */ } }, 4000);
    tx.oncomplete = () => { clearTimeout(timeout); resolve(result); };
    tx.onabort = () => { clearTimeout(timeout); reject(new Error(tx.error?.name ?? "recording_transaction_aborted")); };
    tx.onerror = () => { /* transaction abort is the single error boundary */ };
    try { run(tx, (value) => { result = value; }); }
    catch { tx.abort(); }
  });
}

export async function openRecordingStore() {
  const db = await openDatabase("sasu-meeting-recordings", (db) => {
    db.createObjectStore("recordings", { keyPath: "key" });
    db.createObjectStore("chunks", { keyPath: ["ownerUserId", "deptId", "recordingId", "sequence"] });
  });
  db.onversionchange = () => db.close();
  const getHeader = (scope: RecordingScope) => transaction<Header | undefined>(db, ["recordings"], "readonly", (tx, result) => {
    const request = tx.objectStore("recordings").get(key(scope));
    request.onsuccess = () => result(request.result);
  });
  const getChunk = (scope: RecordingScope, sequence: number) => transaction<StoredCheckpoint | undefined>(db, ["chunks"], "readonly", (tx, result) => {
    const request = tx.objectStore("chunks").get([...key(scope), sequence]);
    request.onsuccess = () => result(request.result);
  });
  const remove = (scope: RecordingScope) => transaction<void>(db, ["recordings", "chunks"], "readwrite", (tx) => {
    tx.objectStore("recordings").delete(key(scope));
    tx.objectStore("chunks").delete(IDBKeyRange.bound([...key(scope), 0], [...key(scope), 1800]));
  });
  async function* read(scope: RecordingScope): AsyncGenerator<Checkpoint> {
    const header = await getHeader(scope);
    if (!header || Date.now() - header.createdAt >= TTL) return;
    if (!Number.isInteger(header.chunks) || header.chunks < 0 || header.chunks > 1800) return;
    for (let sequence = 0; sequence < header.chunks; sequence++) {
      const chunk = await getChunk(scope, sequence);
      if (!chunk || !(chunk.pcm instanceof Int16Array) || chunk.sequence !== sequence ||
        chunk.pcm.length < 1 || chunk.pcm.length > RECORDING_RATE ||
        (sequence < header.chunks - 1 && chunk.pcm.length !== RECORDING_RATE) ||
        chunk.sha256 !== await digest(chunk.pcm)) return;
      yield { sequence, pcm: chunk.pcm };
    }
  }
  return {
    close: () => db.close(),
    async create(scope: RecordingScope, createdAt = Date.now()) {
      if (key(scope).some((value) => !value || value.length > 128)) throw new Error("recording_scope_invalid");
      await transaction<void>(db, ["recordings"], "readwrite", (tx) => {
        tx.objectStore("recordings").add({ ...scope, key: key(scope), createdAt, samples: 0, chunks: 0,
          shortTail: false, complete: false, capturedSamples: 0 } satisfies Header);
      });
      if (!(await getHeader(scope))) throw new Error("recording_storage_unavailable");
    },
    async append(scope: RecordingScope, frame: Checkpoint) {
      if (!Number.isInteger(frame.sequence) || frame.sequence < 0 || frame.sequence >= 1800 ||
        frame.pcm.length < 1 || frame.pcm.length > RECORDING_RATE) throw new Error("recording_checkpoint_invalid");
      const pcm = frame.pcm.slice();
      const sha256 = await digest(pcm);
      await transaction<void>(db, ["recordings", "chunks"], "readwrite", (tx) => {
        const headers = tx.objectStore("recordings");
        const request = headers.get(key(scope));
        request.onsuccess = () => {
          const header: Header | undefined = request.result;
          if (!header || header.complete || header.shortTail || header.chunks !== frame.sequence ||
            Date.now() - header.createdAt >= TTL || header.samples + pcm.length > MAX_RECORDING_SAMPLES) {
            tx.abort(); return;
          }
          try {
            tx.objectStore("chunks").add({ ...scope, sequence: frame.sequence, pcm, sha256 } satisfies StoredCheckpoint);
            headers.put({ ...header, samples: header.samples + pcm.length, chunks: header.chunks + 1, shortTail: pcm.length < RECORDING_RATE });
          } catch { try { tx.abort(); } catch { /* already aborted */ } }
        };
      });
    },
    async finish(scope: RecordingScope, capturedSamples: number, complete: boolean) {
      if (!Number.isInteger(capturedSamples) || capturedSamples < 0 || capturedSamples > MAX_RECORDING_SAMPLES)
        throw new Error("recording_sample_count_invalid");
      await transaction<void>(db, ["recordings"], "readwrite", (tx) => {
        const headers = tx.objectStore("recordings");
        const request = headers.get(key(scope));
        request.onsuccess = () => {
          const header: Header | undefined = request.result;
          if (!header) { tx.abort(); return; }
          headers.put({ ...header, capturedSamples, complete: complete && capturedSamples === header.samples });
        };
      });
    },
    async inspect(scope: RecordingScope) {
      const header = await getHeader(scope);
      if (!header) return null;
      if (Date.now() - header.createdAt >= TTL) { await remove(scope); return null; }
      let samples = 0;
      let chunks = 0;
      for await (const frame of read(scope)) { samples += frame.pcm.length; chunks++; }
      const expectedSamples = Math.max(header.samples, header.capturedSamples);
      return { samples, chunks, expectedSamples, partial: samples !== expectedSamples || chunks !== header.chunks,
        interrupted: !header.complete, createdAt: header.createdAt };
    },
    read,
    remove,
    async cleanup(currentUserId: string) {
      const headers = await transaction<Header[]>(db, ["recordings"], "readonly", (tx, result) => {
        const request = tx.objectStore("recordings").getAll();
        request.onsuccess = () => result(request.result);
      });
      for (const header of headers)
        if (header.ownerUserId !== currentUserId || Date.now() - header.createdAt >= TTL) await remove(header);
    },
  };
}

/** The lock is held by the page, not its worker; closing/crashing releases it.
 * Never steal an old recording. The caller must allocate a new recording ID.
 */
export function acquireCaptureLock(onLost: () => void = () => {}): Promise<() => void> {
  if (!navigator.locks) return Promise.reject(new Error("recording_lock_unavailable"));
  return new Promise((resolve, reject) => {
    void navigator.locks.request("sasu-meeting-capture", { ifAvailable: true }, async (lock) => {
      if (!lock) { reject(new Error("recording_other_tab")); return; }
      const leaseId = crypto.randomUUID();
      const leaseDb = await openDatabase("sasu-meeting-capture-lease", (db) => db.createObjectStore("lease"));
      const channel = new BroadcastChannel("sasu-meeting-capture");
      const heartbeat = () => transaction<void>(leaseDb, ["lease"], "readwrite", (tx) => {
        tx.objectStore("lease").put({ leaseId, expiresAt: Date.now() + 5000 }, "active");
      });
      try {
        await heartbeat();
        await new Promise<void>((unlock) => {
          let stopped = false;
          let previous = Date.now();
          const release = () => {
            if (stopped) return;
            stopped = true;
            clearInterval(timer);
            channel.postMessage({ type: "released", leaseId });
            unlock();
          };
          const lose = () => { onLost(); release(); };
          const timer = setInterval(() => {
            const now = Date.now();
            if (now - previous > 5000) { lose(); return; }
            previous = now;
            void heartbeat().then(() => { if (!stopped) channel.postMessage({ type: "heartbeat", leaseId }); }, lose);
          }, 1000);
          channel.postMessage({ type: "started", leaseId });
          resolve(release);
        });
      } finally {
        await transaction<void>(leaseDb, ["lease"], "readwrite", (tx) => tx.objectStore("lease").delete("active")).catch(() => {});
        leaseDb.close();
        channel.close();
      }
    }).catch(reject);
  });
}
