import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

test("30 minutes of 48kHz samples stream to real IndexedDB with bounded retained heap", async ({ page, context, browser }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("검증 준비 완료");
  const cdp = await context.newCDPSession(page);
  await cdp.send("HeapProfiler.collectGarbage");
  const before = await cdp.send("Runtime.getHeapUsage");
  const result = await page.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: typeof import("../../lib/recording/browser/storage") & typeof import("../../lib/recording/checkpoint-crypto") & { RecordingSession: typeof import("../../lib/recording/session").RecordingSession } }).recordingLab;
    const store = await lab.openRecordingStore(await lab.importRecordingKey(new Uint8Array(32).fill(42)));
    const scope = { ownerUserId: "endurance-user", deptId: "synthetic", recordingId: "thirty-minutes" };
    await store.create(scope);
    let committed: (() => void) | undefined;
    let largestCheckpoint = 0;
    const session = new lab.RecordingSession(48000, async (frame) => {
      largestCheckpoint = Math.max(largestCheckpoint, frame.pcm.byteLength);
      await store.append(scope, frame);
      committed?.();
    });
    const second = new Float32Array(48000);
    let warningAt29 = false;
    for (let i = 0; i < 1800; i++) {
      second.fill(i % 2 === 0 ? 0.25 : -0.25);
      const done = new Promise<void>((resolve) => { committed = resolve; });
      session.push(second);
      await done;
      if (i === 1739) warningAt29 = session.snapshot().warning;
    }
    await session.stop();
    await store.finish(scope, session.snapshot().samples, true);
    const recovery = await store.inspect(scope);
    let sequence = 0;
    let mismatches = 0;
    for await (const frame of store.read(scope)) {
      const expected = sequence++ % 2 === 0 ? 8192 : -8192;
      if (frame.pcm[0] !== expected || frame.pcm.at(-1) !== expected) mismatches++;
    }
    await store.remove(scope);
    store.close();
    return { snapshot: session.snapshot(), recovery, largestCheckpoint, warningAt29, mismatches };
  });
  await cdp.send("HeapProfiler.collectGarbage");
  const after = await cdp.send("Runtime.getHeapUsage");
  expect(result.snapshot).toMatchObject({ state: "stopped", samples: 28_800_000, persistedSamples: 28_800_000, reason: "duration_limit" });
  expect(result.recovery).toMatchObject({ samples: 28_800_000, chunks: 1800, partial: false, interrupted: false });
  expect(result.largestCheckpoint).toBe(32000);
  expect(result.warningAt29).toBe(true);
  expect(result.mismatches).toBe(0);
  expect(after.usedSize - before.usedSize).toBeLessThan(10 * 1024 * 1024);
  const evidence = JSON.stringify({ browser: browser.version(), platform: process.platform, accelerated: true,
    beforeHeap: before.usedSize, afterHeap: after.usedSize, ...result }, null, 2);
  mkdirSync("docs/verification/browser-meeting-recording", { recursive: true });
  writeFileSync("docs/verification/browser-meeting-recording/endurance.json", evidence);
  await testInfo.attach("30-minute-synthetic-evidence.json", { body: evidence, contentType: "application/json" });
});
