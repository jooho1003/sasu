import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("검증 준비 완료");
});

test("committed PCM survives reload, remains scoped, and detects a corrupted checkpoint", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { openRecordingStore } = (window as unknown as { recordingLab: typeof import("../../lib/recording/browser/storage") }).recordingLab;
    const store = await openRecordingStore();
    const scope = { ownerUserId: "synthetic-user", deptId: "synthetic-dept", recordingId: "capture-1" };
    await store.create(scope);
    await store.append(scope, { sequence: 0, pcm: new Int16Array(16000).fill(123) });
    await store.append(scope, { sequence: 1, pcm: new Int16Array(73).fill(-123) });
    const recovery = await store.inspect(scope);
    const other = await store.inspect({ ...scope, ownerUserId: "other" });
    store.close();
    return { recovery, other };
  });
  expect(result.recovery).toMatchObject({ samples: 16073, chunks: 2, partial: false });
  expect(result.other).toBeNull();
  await page.reload();
  await expect(page.locator("#status")).toHaveText("검증 준비 완료");
  expect(await page.evaluate(async () => {
    const { openRecordingStore } = (window as unknown as { recordingLab: typeof import("../../lib/recording/browser/storage") }).recordingLab;
    const store = await openRecordingStore();
    const scope = { ownerUserId: "synthetic-user", deptId: "synthetic-dept", recordingId: "capture-1" };
    const values: number[] = [];
    for await (const chunk of store.read(scope)) values.push(chunk.pcm[0]);
    store.close();
    // Deliberate local corruption: the reader must stop at the first bad hash.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("sasu-meeting-recordings", 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("chunks", "readwrite");
        const os = tx.objectStore("chunks");
        const row = os.get([scope.ownerUserId, scope.deptId, scope.recordingId, 1]);
        row.onsuccess = () => { const value = row.result; value.pcm[0] = 999; os.put(value); };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
    const reopened = await openRecordingStore();
    const damaged = await reopened.inspect(scope);
    reopened.close();
    return { values, damaged };
  })).toMatchObject({ values: [123, -123], damaged: { samples: 16000, chunks: 1, partial: true, expectedSamples: 16073 } });
});

test("out-of-order/duplicate writes fail and expired/other-account drafts are removed", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { openRecordingStore } = (window as unknown as { recordingLab: typeof import("../../lib/recording/browser/storage") }).recordingLab;
    const store = await openRecordingStore();
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
    const lab = (window as unknown as { recordingLab: typeof import("../../lib/recording/browser/storage") }).recordingLab;
    const store = await lab.openRecordingStore();
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
