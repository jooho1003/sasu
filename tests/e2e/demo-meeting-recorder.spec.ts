import { expect, test } from "@playwright/test";
import { stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { DEMO_FEATURES } from "../../lib/demo-access";

const reviews = DEMO_FEATURES.find((feature) => feature.key === "reviews")!.href;

function persistentCounts() {
  const container = process.env.SASU_TEST_DOCKER_DB_CONTAINER;
  if (!container) return null;
  const sql = `select json_build_object(
    'review_recordings',(select count(*) from public.review_recordings),
    'reviewed_materials',(select count(*) from public.reviewed_materials),
    'jobs',(select count(*) from public.jobs),
    'llm_calls',(select count(*) from public.llm_calls),
    'storage_objects',(select count(*) from storage.objects where bucket_id='review-materials')
  )::text`;
  const output = execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c", sql], { encoding: "utf8" });
  return JSON.parse(output.trim()) as Record<string, number>;
}

test("심사위원은 로컬 녹음을 재생·내려받고 합성 전사와 분리해 본다", async ({ page }) => {
  test.setTimeout(90_000);
  const writes: string[] = [];
  const errors: string[] = [];
  const before = persistentCounts();
  page.on("request", (request) => { if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const browser = window as typeof window & { demoAudioContexts: AudioContext[]; indexedDbOpens: number };
    browser.demoAudioContexts = [];
    browser.indexedDbOpens = 0;
    const originalOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<IDBFactory["open"]>) => {
      browser.indexedDbOpens += 1;
      return originalOpen(...args);
    }) as IDBFactory["open"];
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => {
      const audio = new AudioContext();
      await audio.resume();
      const oscillator = audio.createOscillator();
      oscillator.frequency.value = 440;
      const destination = audio.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      browser.demoAudioContexts.push(audio);
      return destination.stream;
    } });
  });
  await page.goto(reviews);
  const fixture = await page.request.get("/demo-files/onsaemiro-sales-weekly-meeting.wav");
  expect(fixture.status()).toBe(200);
  expect((await fixture.body()).length).toBeGreaterThan(100_000);
  await page.getByRole("button", { name: "녹음 시작" }).click();
  await expect(page.getByRole("button", { name: "녹음 끝내기" })).toBeVisible();
  await page.waitForTimeout(1300);
  await page.getByRole("button", { name: "녹음 끝내기" }).click();
  await expect(page.getByRole("link", { name: "내 녹음 내려받기" })).toHaveAttribute("href", /^blob:/);
  await expect(page.getByLabel("방금 녹음한 소리 재생")).toHaveAttribute("src", /^blob:/);
  const duration = await page.getByLabel("방금 녹음한 소리 재생").evaluate(async (element) => {
    const audio = element as HTMLAudioElement;
    await audio.play();
    return audio.duration;
  });
  expect(duration).toBeGreaterThan(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "내 녹음 내려받기" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/내-녹음\.(webm|m4a)$/u);
  expect((await stat(await download.path())).size).toBeGreaterThan(100);
  await expect(page.getByText("직접 녹음한 소리를 받아쓴 결과가 아닙니다.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "받아쓴 글 고치기" }).click();
  await page.getByLabel("가상 회의 받아쓴 글").fill(`${await page.getByLabel("가상 회의 받아쓴 글").inputValue()}\n검토 메모: 가상 예시입니다.`);
  await page.getByRole("button", { name: "합성 예시 확정하기" }).click();
  await expect(page.getByText("근거 요약 미리보기")).toBeVisible();
  await page.screenshot({ path: "docs/verification/browser-meeting-recording/step3-demo-local.png", fullPage: true });
  expect(await page.evaluate(() => (window as typeof window & { indexedDbOpens: number }).indexedDbOpens)).toBe(0);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
  expect(persistentCounts()).toEqual(before);
  await page.reload();
  await expect(page.getByRole("link", { name: "내 녹음 내려받기" })).toHaveCount(0);
  await expect(page.getByText("가상 회의를 받아쓴 글", { exact: true })).toBeVisible();
});

test("마이크 거절 뒤에도 준비된 합성 회의를 끝까지 체험한다", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => { throw new DOMException("denied", "NotAllowedError"); } });
  });
  await page.goto(reviews);
  await page.getByRole("button", { name: "녹음 시작" }).click();
  await expect(page.locator(".demo-meeting-recorder [role=alert]")).toContainText("합성 회의로 계속 체험");
  await page.getByRole("button", { name: "받아쓴 글 고치기" }).click();
  await page.getByRole("button", { name: "합성 예시 확정하기" }).click();
  await expect(page.getByText("근거 요약 미리보기")).toBeVisible();
});
