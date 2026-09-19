import { expect, test } from "@playwright/test";

test("real AudioWorklet/Worker records synthetic input, pauses, recovers and emits a playable WAV without uploads", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => { if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url()); });
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("검증 준비 완료");
  await page.getByRole("button", { name: "합성 입력 시작", exact: true }).click();
  await expect(page.locator("#status")).toContainText('"state": "recording"');
  await expect.poll(() => page.locator("#status").textContent()).toMatch(/"persistedSamples": [1-9]/);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  await expect(page.locator("#status")).toContainText('"state": "paused"');
  const snapshot = JSON.parse((await page.locator("#status").textContent())!);
  // Wait on browser time only to assert that a pause excludes captured samples.
  await page.waitForTimeout(300);
  expect(JSON.parse((await page.locator("#status").textContent())!).samples).toBe(snapshot.samples);
  await page.getByRole("button", { name: "재개", exact: true }).click();
  await expect(page.locator("#status")).toContainText('"state": "recording"');
  await page.getByRole("button", { name: "종료", exact: true }).click();
  await expect(page.locator("#status")).toContainText('"state": "stopped"');
  await page.getByRole("button", { name: "확인 구간 복구", exact: true }).click();
  await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/);
  expect(await page.locator("audio").evaluate(async (audio: HTMLAudioElement) => {
    await audio.play();
    audio.pause();
    return { duration: audio.duration, error: audio.error?.code ?? null };
  })).toMatchObject({ error: null });
  const recovery = JSON.parse((await page.locator("#status").textContent())!);
  expect(recovery.partial).toBe(false);
  expect(recovery.interrupted).toBe(false);
  await page.screenshot({ path: "docs/verification/browser-meeting-recording/synthetic-recovery.png", fullPage: true });
  await page.reload();
  await page.getByRole("button", { name: "확인 구간 복구", exact: true }).click();
  await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/);
  expect(writes).toEqual([]);
});

test("ending a required input interrupts recording and closes all tracks", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "합성 입력 시작", exact: true }).click();
  await expect(page.locator("#status")).toContainText('"state": "recording"');
  await page.getByRole("button", { name: "입력 종료 시험", exact: true }).click();
  await expect(page.locator("#status")).toContainText('"reason": "input_ended"');
  await expect(page.locator("#status")).toContainText('"state": "interrupted"');
  expect(await page.evaluate(() => (window as unknown as { labTracks: MediaStreamTrack[] }).labTracks.every((track) => track.readyState === "ended"))).toBe(true);
});
