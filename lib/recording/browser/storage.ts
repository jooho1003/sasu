import { MAX_RECORDING_SAMPLES, RECORDING_RATE } from "../pcm";
import type { Checkpoint } from "../session";
import {
  decryptRecordingCheckpoint,
  encryptRecordingCheckpoint,
  type EncryptedRecordingCheckpoint,
} from "../checkpoint-crypto";

export type RecordingScope = { ownerUserId: string; deptId: string; recordingId: string };
type Header = RecordingScope & {
  key: string[];
  createdAt: number;
  samples: number;
  chunks: number;
  shortTail: boolean;
  complete: boolean;
  paused: boolean;
  capturedSamples: number;
  levelVectors: number[][];
  captureHealth: { clipping_ratio: number; checkpoint_delays: number; max_pending_samples: number;
    backlog_stops: number; max_sample_wall_gap_ms: number; microphone_reselects: number };
  noncePrefix: Uint8Array<ArrayBuffer>;
};
type StoredCheckpoint = RecordingScope & EncryptedRecordingCheckpoint;
const TTL = 24 * 60 * 60 * 1000;
const key = (scope: RecordingScope) => [scope.ownerUserId, scope.deptId, scope.recordingId];

function openDatabase(name: string, upgrade: (db: IDBDatabase, oldVersion: number) => void, version = 1): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(name, version);
    const fail = () => { settled = true; clearTimeout(timer); reject(new Error("recording_storage_unavailable")); };
    const timer = setTimeout(fail, 5000);
    request.onupgradeneeded = (event) => upgrade(request.result, event.oldVersion);
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

export async function openRecordingStore(recordingKey: CryptoKey) {
  if (recordingKey.algorithm.name !== "AES-GCM" || !recordingKey.usages.includes("decrypt")) {
    throw new Error("recording_key_invalid");
  }
  const db = await openDatabase("sasu-meeting-recordings", (db, oldVersion) => {
    // Version 1 contained plaintext PCM and was a synthetic-only technical gate.
    // It cannot be migrated safely, so remove it before real-input support exists.
    if (oldVersion < 2) {
      if (db.objectStoreNames.contains("recordings")) db.deleteObjectStore("recordings");
      if (db.objectStoreNames.contains("chunks")) db.deleteObjectStore("chunks");
    }
    db.createObjectStore("recordings", { keyPath: "key" });
    db.createObjectStore("chunks", { keyPath: ["ownerUserId", "deptId", "recordingId", "sequence"] });
  }, 2);
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
    if (!(header.noncePrefix instanceof Uint8Array) || header.noncePrefix.byteLength !== 8) return;
    for (let sequence = 0; sequence < header.chunks; sequence++) {
      const chunk = await getChunk(scope, sequence);
      if (!chunk || !(chunk.ciphertext instanceof ArrayBuffer) || chunk.sequence !== sequence ||
        !Number.isInteger(chunk.sampleCount) || chunk.sampleCount < 1 || chunk.sampleCount > RECORDING_RATE ||
        (sequence < header.chunks - 1 && chunk.sampleCount !== RECORDING_RATE)) return;
      try {
        yield await decryptRecordingCheckpoint(recordingKey, scope, header.noncePrefix, chunk);
      } catch {
        return;
      }
    }
  }
  return {
    close: () => db.close(),
    async create(scope: RecordingScope, createdAt = Date.now()) {
      if (key(scope).some((value) => !value || value.length > 128)) throw new Error("recording_scope_invalid");
      await transaction<void>(db, ["recordings"], "readwrite", (tx) => {
        tx.objectStore("recordings").add({ ...scope, key: key(scope), createdAt, samples: 0, chunks: 0,
          shortTail: false, complete: false, paused: false, capturedSamples: 0,
          levelVectors: [], captureHealth: { clipping_ratio: 0, checkpoint_delays: 0,
            max_pending_samples: 0, backlog_stops: 0, max_sample_wall_gap_ms: 0, microphone_reselects: 0 },
          noncePrefix: crypto.getRandomValues(new Uint8Array(8)) } satisfies Header);
      });
      if (!(await getHeader(scope))) throw new Error("recording_storage_unavailable");
    },
    async append(scope: RecordingScope, frame: Checkpoint) {
      if (!Number.isInteger(frame.sequence) || frame.sequence < 0 || frame.sequence >= 1800 ||
        frame.pcm.length < 1 || frame.pcm.length > RECORDING_RATE) throw new Error("recording_checkpoint_invalid");
      const header = await getHeader(scope);
      if (!header) throw new Error("recording_transaction_aborted");
      const encrypted = await encryptRecordingCheckpoint(recordingKey, scope, header.noncePrefix, frame);
      await transaction<void>(db, ["recordings", "chunks"], "readwrite", (tx) => {
        const headers = tx.objectStore("recordings");
        const request = headers.get(key(scope));
        request.onsuccess = () => {
          const current: Header | undefined = request.result;
          if (!current || current.complete || current.shortTail || current.chunks !== frame.sequence ||
            Date.now() - current.createdAt >= TTL || current.samples + encrypted.sampleCount > MAX_RECORDING_SAMPLES ||
            !(current.noncePrefix instanceof Uint8Array) ||
            current.noncePrefix.some((value, index) => value !== header.noncePrefix[index])) {
            tx.abort(); return;
          }
          try {
            tx.objectStore("chunks").add({ ...scope, ...encrypted } satisfies StoredCheckpoint);
            headers.put({ ...current, samples: current.samples + encrypted.sampleCount,
              chunks: current.chunks + 1, shortTail: encrypted.sampleCount < RECORDING_RATE });
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
    async markPaused(scope: RecordingScope) {
      await transaction<void>(db, ["recordings"], "readwrite", (tx) => {
        const headers = tx.objectStore("recordings");
        const request = headers.get(key(scope));
        request.onsuccess = () => {
          const header: Header | undefined = request.result;
          if (!header) { tx.abort(); return; }
          headers.put({ ...header, paused: true });
        };
      });
    },
    async recordProfile(scope: RecordingScope, levels: number[][], health: Header["captureHealth"]) {
      if (levels.length > 1800 || levels.some((vector) => ![1, 2].includes(vector.length) ||
        vector.length !== levels[0].length || vector.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) ||
        !Number.isFinite(health.clipping_ratio) || health.clipping_ratio < 0 || health.clipping_ratio > 1 ||
        !Number.isInteger(health.checkpoint_delays) || health.checkpoint_delays < 0 || health.checkpoint_delays > 1800 ||
        !Number.isInteger(health.max_pending_samples) || health.max_pending_samples < 0 || health.max_pending_samples > 1_000_000 ||
        !Number.isInteger(health.backlog_stops) || health.backlog_stops < 0 || health.backlog_stops > 1 ||
        !Number.isInteger(health.max_sample_wall_gap_ms) || health.max_sample_wall_gap_ms < 0 ||
        health.max_sample_wall_gap_ms > 1_800_000 ||
        !Number.isInteger(health.microphone_reselects) || health.microphone_reselects < 0 || health.microphone_reselects > 100)
        throw new Error("recording_profile_invalid");
      await transaction<void>(db, ["recordings"], "readwrite", (tx) => {
        const headers = tx.objectStore("recordings");
        const request = headers.get(key(scope));
        request.onsuccess = () => {
          const header: Header | undefined = request.result;
          if (!header) { tx.abort(); return; }
          const vectors = header.levelVectors ?? [];
          if (levels.length < vectors.length || (vectors.length && levels.length && vectors[0].length !== levels[0].length))
            { tx.abort(); return; }
          headers.put({ ...header, levelVectors: levels.map((vector) => vector.slice()), captureHealth: health });
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
        paused: header.paused === true,
        interrupted: !header.complete, createdAt: header.createdAt,
        levelVectors: header.levelVectors ?? [], captureHealth: Object.assign({
          clipping_ratio: 0, checkpoint_delays: 0, max_pending_samples: 0,
          backlog_stops: 0, max_sample_wall_gap_ms: 0, microphone_reselects: 0,
        }, header.captureHealth ?? {}) };
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

/** Exercise the encrypted PCM path before any live samples are accepted.
 * Only this small synthetic probe is written, then removed. A recording ID
 * is created only after encryption, commit, read and decryption all succeed.
 */
export async function probeRecordingStore(scope: RecordingScope, recordingKey: CryptoKey) {
  const estimate = await navigator.storage.estimate();
  if (estimate.quota !== undefined && estimate.usage !== undefined && estimate.quota - estimate.usage < 64 * 1024 * 1024)
    throw new Error("storage_space_insufficient");
  const store = await openRecordingStore(recordingKey);
  const probe = { ...scope, recordingId: `probe-${crypto.randomUUID()}` };
  try {
    await store.cleanup(scope.ownerUserId);
    const pcm = new Int16Array([17, -17, 32767, -32768]);
    try {
      await store.create(probe);
      await store.append(probe, { sequence: 0, pcm });
      let verified = false;
      for await (const frame of store.read(probe)) {
        verified = frame.sequence === 0 && frame.pcm.length === pcm.length &&
          frame.pcm.every((sample, index) => sample === pcm[index]);
      }
      if (!verified) throw new Error("recording_storage_unavailable");
    } finally { await store.remove(probe); }
    return;
  } finally { store.close(); }
}

export async function prepareRecordingStore(scope: RecordingScope, recordingKey: CryptoKey) {
  await probeRecordingStore(scope, recordingKey);
  const store = await openRecordingStore(recordingKey);
  try {
    await store.create(scope);
    return store;
  } catch (error) { store.close(); throw error; }
}

export async function removeLocalRecording(scope: RecordingScope) {
  // Deletion needs no recording secret; a temporary key only opens the store adapter.
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const store = await openRecordingStore(key);
  try { await store.remove(scope); } finally { store.close(); }
}

export async function cleanupLocalRecordings(userId: string) {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const store = await openRecordingStore(key);
  try { await store.cleanup(userId); } finally { store.close(); }
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
