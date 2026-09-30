import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

type Lab = typeof import("../../lib/recording/browser/storage") &
  typeof import("../../lib/recording/checkpoint-crypto") & typeof import("../../lib/recording/original-segments");

test("encrypted recovery creates independent WAV originals and a playable verified transcription boundary without uploads", async ({ page, browser }) => {
  const writes: string[] = [];
  page.on("request", (request) => { if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url()); });
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("검증 준비 완료");
  const audio = await page.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: Lab }).recordingLab;
    const store = await lab.openRecordingStore(await lab.importRecordingKey(new Uint8Array(32).fill(42)));
    const scope = { ownerUserId: "lab-synthetic-user", deptId: "lab-synthetic-dept", recordingId: "original-bundle" };
    sessionStorage.setItem("recording-lab-id", scope.recordingId);
    try {
      await store.create(scope);
      for (let sequence = 0; sequence < 61; sequence++)
        await store.append(scope, { sequence, pcm: new Int16Array(16000).fill(sequence < 60 ? 4000 : -4000) });
      await store.append(scope, { sequence: 61, pcm: new Int16Array(73).fill(-123) });
      await store.finish(scope, 976073, true);
      const originals = [];
      for await (const original of lab.streamRecordingOriginals(store.read(scope))) originals.push(original);
      const manifest = { version: 1, segments: originals.map((original) => original.descriptor) };
      const part = await lab.createRecordingTranscriptionPart(manifest, 0, originals[0].wav, originals[1].wav);
      const view = new DataView(part.wav.buffer);
      const player = document.querySelector<HTMLAudioElement>("audio")!;
      const url = URL.createObjectURL(new Blob([part.wav], { type: "audio/wav" }));
      player.src = url;
      try {
        await player.play();
        player.pause();
        return { duration: player.duration, error: player.error?.code ?? null, bytes: part.wav.byteLength,
          beforeBoundary: view.getInt16(44 + 960000 * 2 - 2, true), afterBoundary: view.getInt16(44 + 960000 * 2, true),
          fingerprint: await lab.recordingManifestFingerprint(manifest), manifest };
      } finally { player.removeAttribute("src"); URL.revokeObjectURL(url); }
    } finally { store.close(); }
  });
  expect(audio).toMatchObject({ duration: 61, error: null, bytes: 1952044, beforeBoundary: 4000, afterBoundary: -4000 });
  await page.getByRole("button", { name: "원본 구간 검사", exact: true }).click();
  await expect(page.locator("#status")).toContainText("원본 구간 검사 완료");
  const prepared = JSON.parse((await page.locator("#status").textContent())!);
  expect(prepared).toMatchObject({ samples: 976073, bytes: 1952234, transmitted: false, interrupted: false,
    fingerprint: audio.fingerprint, manifest: audio.manifest });
  const canonical = "sasu-recording-manifest-v1\n" + audio.manifest.segments.map((segment) =>
    `${segment.index}:${segment.sample_count}:${segment.bytes}:${segment.sha256}\n`).join("");
  expect(prepared.fingerprint).toBe(createHash("sha256").update(canonical, "utf8").digest("hex"));
  await page.reload();
  await page.getByRole("button", { name: "원본 구간 검사", exact: true }).click();
  await expect(page.locator("#status")).toContainText(audio.fingerprint);
  expect(writes).toEqual([]);
  writeFileSync("docs/verification/recording-originals-2026-09-25/original-bundle.json", JSON.stringify({ browser: browser.version(), platform: process.platform,
    synthetic: true, networkWrites: writes.length, audio, prepared }, null, 2));
  await page.screenshot({ path: "docs/verification/recording-originals-2026-09-25/original-bundle.png", fullPage: true });
});

test("a missing encrypted checkpoint cannot be presented as a complete original bundle", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("검증 준비 완료");
  await page.evaluate(async () => {
    const lab = (window as unknown as { recordingLab: Lab }).recordingLab;
    const scope = { ownerUserId: "lab-synthetic-user", deptId: "lab-synthetic-dept", recordingId: "damaged-originals" };
    sessionStorage.setItem("recording-lab-id", scope.recordingId);
    const store = await lab.openRecordingStore(await lab.importRecordingKey(new Uint8Array(32).fill(42)));
    try {
      await store.create(scope);
      for (let sequence = 0; sequence < 3; sequence++) await store.append(scope, { sequence, pcm: new Int16Array(16000) });
      await store.finish(scope, 48000, true);
    } finally { store.close(); }
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("sasu-meeting-recordings", 2);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("chunks", "readwrite");
        tx.objectStore("chunks").delete([scope.ownerUserId, scope.deptId, scope.recordingId, 1]);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
      request.onerror = () => reject(request.error);
    });
  });
  await page.getByRole("button", { name: "원본 구간 검사", exact: true }).click();
  await expect(page.locator("#status")).toContainText("일부 구간이 손상됐습니다");
  await expect(page.locator("#status")).not.toContainText("원본 구간 검사 완료");
});
