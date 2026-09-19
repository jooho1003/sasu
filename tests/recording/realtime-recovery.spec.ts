import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

test("three real minutes of synthetic AudioWorklet capture survive a recording-page reload", async ({ page, browser }) => {
  test.skip(process.env.E2E_RECORDING_REALTIME !== "1", "3분 실시간 합성 캡처는 E2E_RECORDING_REALTIME=1로 실행");
  test.setTimeout(240_000);
  await page.goto("/");
  await page.getByRole("button", { name: "합성 입력 시작", exact: true }).click();
  const started = Date.now();
  await expect.poll(async () => {
    const text = await page.locator("#status").textContent();
    try { return JSON.parse(text ?? "{}").persistedSamples ?? 0; } catch { return 0; }
  }, { timeout: 210_000, intervals: [1000] }).toBeGreaterThanOrEqual(180 * 16000);
  const before = JSON.parse((await page.locator("#status").textContent())!);
  await page.reload();
  await expect(page.locator("#status")).toHaveText("검증 준비 완료");
  await page.getByRole("button", { name: "확인 구간 복구", exact: true }).click();
  await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/);
  const after = JSON.parse((await page.locator("#status").textContent())!);
  expect(after.samples).toBeGreaterThanOrEqual(before.persistedSamples);
  expect(after.interrupted).toBe(true);
  expect(after.chunks).toBeGreaterThanOrEqual(180);
  mkdirSync("docs/verification/browser-meeting-recording", { recursive: true });
  writeFileSync("docs/verification/browser-meeting-recording/realtime-recovery.json", JSON.stringify({
    browser: browser.version(), platform: process.platform, synthetic: true, accelerated: false,
    elapsedMs: Date.now() - started, before, after,
  }, null, 2));
  await page.screenshot({ path: "docs/verification/browser-meeting-recording/realtime-recovery.png", fullPage: true });
});
