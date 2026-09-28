import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("검증 준비 완료");
});

test("preflight checks encrypted storage without occupying the real recording ID", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: typeof import("../../lib/recording/browser/storage") & typeof import("../../lib/recording/checkpoint-crypto") }).recordingLab;
    const key = await lab.importRecordingKey(new Uint8Array(32).fill(42));
    const scope = { ownerUserId: "preflight-user", deptId: "preflight-dept", recordingId: "preflight-recording" };
    await lab.probeRecordingStore(scope, key);
    const before = await lab.openRecordingStore(key);
    const occupied = await before.inspect(scope);
    before.close();
    const prepared = await lab.prepareRecordingStore(scope, key);
    await prepared.append(scope, { sequence: 0, pcm: new Int16Array([7, -7]) });
    const saved = await prepared.inspect(scope);
    await prepared.remove(scope);
    prepared.close();
    return { occupied, saved };
  });
  expect(result.occupied).toBeNull();
  expect(result.saved).toMatchObject({ samples: 2, chunks: 1, partial: false });
});

test("one-byte per-input profile and capture health survive a reload", async ({ page }) => {
  await page.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: typeof import("../../lib/recording/browser/storage") & typeof import("../../lib/recording/checkpoint-crypto") }).recordingLab;
    const store = await lab.openRecordingStore(await lab.importRecordingKey(new Uint8Array(32).fill(42)));
    const scope = { ownerUserId: "profile-user", deptId: "profile-dept", recordingId: "profile-1" };
    await store.create(scope);
    await store.append(scope, { sequence: 0, pcm: new Int16Array(16000) });
    await store.recordProfile(scope, [[30, 210]], { clipping_ratio: 0.06, checkpoint_delays: 1,
      max_pending_samples: 2048, backlog_stops: 0, max_sample_wall_gap_ms: 300, microphone_reselects: 1 });
    store.close();
  });
  await page.reload();
  expect(await page.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: typeof import("../../lib/recording/browser/storage") & typeof import("../../lib/recording/checkpoint-crypto") }).recordingLab;
    const store = await lab.openRecordingStore(await lab.importRecordingKey(new Uint8Array(32).fill(42)));
    const scope = { ownerUserId: "profile-user", deptId: "profile-dept", recordingId: "profile-1" };
    const result = await store.inspect(scope);
    await store.remove(scope);
    store.close();
    return result;
  })).toMatchObject({ levelVectors: [[30, 210]], captureHealth: {
    clipping_ratio: 0.06, checkpoint_delays: 1, max_pending_samples: 2048,
    backlog_stops: 0, max_sample_wall_gap_ms: 300, microphone_reselects: 1,
  } });
});

test("committed PCM survives reload, remains scoped, and detects a corrupted checkpoint", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: typeof import("../../lib/recording/browser/storage") & typeof import("../../lib/recording/checkpoint-crypto") }).recordingLab;
    const key = await lab.importRecordingKey(new Uint8Array(32).fill(42));
    const store = await lab.openRecordingStore(key);
    const scope = { ownerUserId: "synthetic-user", deptId: "synthetic-dept", recordingId: "capture-1" };
    await store.create(scope);
    await store.append(scope, { sequence: 0, pcm: new Int16Array(16000).fill(123) });
    await store.append(scope, { sequence: 1, pcm: new Int16Array(73).fill(-123) });
    const recovery = await store.inspect(scope);
    const other = await store.inspect({ ...scope, ownerUserId: "other" });
    const stored = await new Promise<{ pcm?: unknown; sampleCount: number; ciphertext: ArrayBuffer }>((resolve, reject) => {
      const request = indexedDB.open("sasu-meeting-recordings", 2);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("chunks", "readonly");
        const row = tx.objectStore("chunks").get([scope.ownerUserId, scope.deptId, scope.recordingId, 0]);
        row.onsuccess = () => resolve(row.result);
        row.onerror = () => reject(row.error);
        tx.oncomplete = () => db.close();
      };
      request.onerror = () => reject(request.error);
    });
    store.close();
    const ciphertext = new Uint8Array(stored.ciphertext);
    let plaintextPatternFound = false;
    for (let offset = 0; offset <= ciphertext.length - 64; offset++) {
      if (Array.from(ciphertext.subarray(offset, offset + 64)).every((byte, index) => byte === (index % 2 === 0 ? 123 : 0))) {
        plaintextPatternFound = true; break;
      }
    }
    return { recovery, other, stored: { hasPcm: "pcm" in stored, sampleCount: stored.sampleCount,
      encryptedBytes: stored.ciphertext.byteLength, plaintextPatternFound } };
  });
  expect(result.recovery).toMatchObject({ samples: 16073, chunks: 2, partial: false });
  expect(result.other).toBeNull();
  expect(result.stored).toEqual({ hasPcm: false, sampleCount: 16000, encryptedBytes: 32016, plaintextPatternFound: false });
  await page.reload();
  await expect(page.locator("#status")).toHaveText("검증 준비 완료");
  expect(await page.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: typeof import("../../lib/recording/browser/storage") & typeof import("../../lib/recording/checkpoint-crypto") }).recordingLab;
    const key = await lab.importRecordingKey(new Uint8Array(32).fill(42));
    const store = await lab.openRecordingStore(key);
    const scope = { ownerUserId: "synthetic-user", deptId: "synthetic-dept", recordingId: "capture-1" };
    const values: number[] = [];
    for await (const chunk of store.read(scope)) values.push(chunk.pcm[0]);
    store.close();
    // Deliberate local corruption: the reader must stop at the first bad hash.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("sasu-meeting-recordings", 2);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("chunks", "readwrite");
        const os = tx.objectStore("chunks");
        const row = os.get([scope.ownerUserId, scope.deptId, scope.recordingId, 1]);
        row.onsuccess = () => {
          const value = row.result;
          const bytes = new Uint8Array(value.ciphertext);
          bytes[0] ^= 0xff;
          os.put(value);
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
    const reopened = await lab.openRecordingStore(key);
    const damaged = await reopened.inspect(scope);
    reopened.close();
    return { values, damaged };
  })).toMatchObject({ values: [123, -123], damaged: { samples: 16000, chunks: 1, partial: true, expectedSamples: 16073 } });
});

test("out-of-order/duplicate writes fail and expired/other-account drafts are removed", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: typeof import("../../lib/recording/browser/storage") & typeof import("../../lib/recording/checkpoint-crypto") }).recordingLab;
    const store = await lab.openRecordingStore(await lab.importRecordingKey(new Uint8Array(32).fill(42)));
    const scope = { ownerUserId: "user", deptId: "dept", recordingId: "one" };
    await store.create(scope);
    const frame = { sequence: 0, pcm: new Int16Array(16000) };
    await store.append(scope, frame);
    const duplicate = await store.append(scope, frame).then(() => false, () => true);
    const gap = await store.append(scope, { ...frame, sequence: 2 }).then(() => false, () => true);
    await store.create({ ...scope, recordingId: "expired" }, Date.now() - 86400001);
    await store.create({ ...scope, ownerUserId: "previous" });
    await store.cleanup("user");
    const kept = await store.inspect(scope);
    const expired = await store.inspect({ ...scope, recordingId: "expired" });
    const previous = await store.inspect({ ...scope, ownerUserId: "previous" });
    await store.remove(scope);
    const deleted = await store.inspect(scope);
    store.close();
    return { duplicate, gap, kept, expired, previous, deleted };
  });
  expect(result).toMatchObject({ duplicate: true, gap: true, kept: { samples: 16000 }, expired: null, previous: null, deleted: null });
});

test("two tabs cannot record concurrently; releasing allows a new recording", async ({ page, context }) => {
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.locator("#status")).toHaveText("검증 준비 완료");
  await page.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: typeof import("../../lib/recording/browser/storage") }).recordingLab;
    Object.assign(window, { releaseCapture: await lab.acquireCaptureLock() });
  });
  expect(await second.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: typeof import("../../lib/recording/browser/storage") }).recordingLab;
    return lab.acquireCaptureLock().then((release) => { release(); return false; }, () => true);
  })).toBe(true);
  await page.close();
  await expect.poll(() => second.evaluate(async () => {
    return !(await navigator.locks.query()).held?.some((lock) => lock.name === "sasu-meeting-capture");
  })).toBe(true);
  expect(await second.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: typeof import("../../lib/recording/browser/storage") }).recordingLab;
    const release = await lab.acquireCaptureLock();
    release();
    return true;
  })).toBe(true);
});

test("a real IndexedDB transaction abort leaves neither a chunk nor an acknowledged header", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.name));
  const result = await page.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: typeof import("../../lib/recording/browser/storage") & typeof import("../../lib/recording/checkpoint-crypto") }).recordingLab;
    const store = await lab.openRecordingStore(await lab.importRecordingKey(new Uint8Array(32).fill(42)));
    const scope = { ownerUserId: "quota", deptId: "synthetic", recordingId: "aborted" };
    await store.create(scope);
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      const request = add.apply(this, args);
      if (this.name === "chunks") this.transaction.abort();
      return request;
    };
    let rejected = false;
    try { await store.append(scope, { sequence: 0, pcm: new Int16Array(16000) }); }
    catch { rejected = true; }
    finally { IDBObjectStore.prototype.add = add; }
    const recovery = await store.inspect(scope);
    // A later valid retry is still sequence zero; failed writes consume no index.
    await store.append(scope, { sequence: 0, pcm: new Int16Array(16000) });
    const retried = await store.inspect(scope);
    store.close();
    return { rejected, recovery, retried };
  });
  expect(result).toMatchObject({ rejected: true, recovery: { samples: 0, chunks: 0 }, retried: { samples: 16000, chunks: 1 } });
  expect(errors).toEqual([]);
});
