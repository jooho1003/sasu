import { expect, test } from "@playwright/test";

test("a silent worker disconnect stops capture, releases tracks, and recovers committed audio", async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        let disconnected = false;
        this.addEventListener("message", (event: MessageEvent) => {
          if (disconnected) { event.stopImmediatePropagation(); return; }
          if (event.data.snapshot?.persistedSamples >= 16000) disconnected = true;
        });
      }
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "합성 입력 시작", exact: true }).click();
  await expect(page.locator("#status")).toContainText('"state": "recording"');
  await expect(page.locator("#status")).toContainText('"reason": "capture_worker_timeout"', { timeout: 12_000 });
  await expect(page.locator("#status")).toContainText('"state": "interrupted"');
  const before = JSON.parse((await page.locator("#status").textContent())!);
  expect(before.persistedSamples).toBeGreaterThanOrEqual(16000);
  expect(await page.evaluate(() => (window as unknown as { labTracks: MediaStreamTrack[] }).labTracks.every((track) => track.readyState === "ended"))).toBe(true);
  await page.getByRole("button", { name: "확인 구간 복구", exact: true }).click();
  await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/);
  const recovered = JSON.parse((await page.locator("#status").textContent())!);
  expect(recovered.samples).toBeGreaterThanOrEqual(before.persistedSamples);
  expect(recovered.interrupted).toBe(true);
  await page.screenshot({ path: "docs/verification/recording-capture-2026-09-25/worker-timeout-recovery.png", fullPage: true });
  // A released lease permits a fresh recording, without stealing the old ID.
  await page.getByRole("button", { name: "합성 입력 시작", exact: true }).click();
  await expect(page.locator("#status")).toContainText('"state": "recording"');
  await page.getByRole("button", { name: "종료", exact: true }).click();
  await expect(page.locator("#status")).toContainText('"state": "stopped"');
});

test("a worker error without a snapshot is shown as interrupted rather than leaving a running timer", async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", (event: MessageEvent) => {
          if (event.data.type === "ready") setTimeout(() => {
            this.dispatchEvent(new MessageEvent("message", { data: { type: "error", reason: "synthetic_failure" } }));
          }, 250);
        });
      }
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "합성 입력 시작", exact: true }).click();
  await expect(page.locator("#status")).toContainText('"reason": "capture_worker_failed"');
  await expect(page.locator("#status")).toContainText('"state": "interrupted"');
  expect(await page.evaluate(() => (window as unknown as { labTracks: MediaStreamTrack[] }).labTracks.every((track) => track.readyState === "ended"))).toBe(true);
});
