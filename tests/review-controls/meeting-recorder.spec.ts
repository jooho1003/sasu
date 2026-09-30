import { expect, test } from "@playwright/test";

test("synthetic input completes test, session preflight, recording and reload recovery", async ({ page }) => {
  test.setTimeout(90_000);
  const key = Buffer.alloc(32, 7).toString("base64url");
  let keyRequests = 0;
  let discards = 0;
  const sessions: Record<string, unknown>[] = [];
  const previousId = "44444444-4444-4444-8444-444444444444";
  await page.addInitScript(() => {
    const wakeState = window as typeof window & { wakeRequests: number; releaseWake: () => Promise<void> };
    wakeState.wakeRequests = 0;
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: async () => {
      wakeState.wakeRequests++;
      const lock = new EventTarget() as EventTarget & { release: () => Promise<void> };
      lock.release = async () => { lock.dispatchEvent(new Event("release")); };
      wakeState.releaseWake = lock.release;
      return lock;
    } } });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => {
      const context = new AudioContext();
      await context.resume();
      const source = context.createOscillator();
      source.frequency.value = 440;
      const destination = context.createMediaStreamDestination();
      source.connect(destination);
      source.start();
      return destination.stream;
    } });
  });
  await page.route("**/api/d/dept/reviews", route => route.fulfill({ json: {
    reviews: [], members: [{ user_id: "synthetic-user", display_name: "합성 녹음자", consented_at: new Date().toISOString() }],
  } }));
  await page.route("**/api/d/dept/recordings", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { recordings: sessions } });
    const input = route.request().postDataJSON();
    const session = { ...input, state: "active", started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(), state_reason: null };
    sessions.push(session);
    return route.fulfill({ status: 201, json: session });
  });
  await page.route("**/api/d/dept/recordings?recent=1", route => route.fulfill({ json: {
    recordings: [{ id: previousId, title: "이전 회의", state: "completed", started_at: new Date().toISOString() }, ...sessions],
  } }));
  await page.route("**/api/d/dept/recordings/*/key", route => { keyRequests++; return route.fulfill({ json: { key } }); });
  await page.route("**/api/d/dept/recordings/*/discard", route => { discards++; return route.fulfill({ json: {} }); });
  await page.goto("/?view=recorder");
  await expect(page.getByLabel("회의 제목")).toBeVisible();
  await expect(page.locator(".recorder-steps [aria-current='step']")).toContainText("입력 확인");
  await page.getByLabel("회의 제목").fill("합성 회의");
  await page.getByLabel("이어서 녹음").selectOption(previousId);
  await page.getByRole("checkbox", { name: /참석자 전원 녹음 동의/ }).check();
  await page.getByRole("button", { name: "5초 테스트 녹음" }).click();
  await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/, { timeout: 12000 });
  await page.getByRole("checkbox", { name: /테스트를 듣고/ }).check();
  await expect(page.getByRole("button", { name: "녹음 준비", exact: true })).toHaveCount(0);
  const baseTitle = await page.title();
  await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
  expect(sessions[0]?.continues_recording_id).toBe(previousId);
  await expect(page.getByRole("button", { name: "녹음 종료" })).toBeVisible();
  await expect.poll(() => page.title()).toContain("녹음 중");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "docs/verification/recording-ux-2026-09-29/s8-recording-1440.png", fullPage: true });
  const recordingUrl = page.url();
  await page.getByRole("link", { name: "← 올린 자료 확인" }).click();
  expect(page.url()).toBe(recordingUrl);
  await expect(page.getByText(/녹음 중에는 다른 화면으로 이동하지 않습니다/)).toBeVisible();
  expect(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(true);
  await page.getByRole("button", { name: "녹음 종료" }).click();
  await expect(page.getByRole("group", { name: "녹음 종료 확인" })).toBeVisible();
  await expect(page.getByRole("button", { name: "녹음 잠시 멈추기" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "docs/verification/recording-ux-2026-09-29/s2-stop-confirm-1440.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "docs/verification/recording-ux-2026-09-29/s2-stop-confirm-390.png", fullPage: true });
  await page.getByRole("button", { name: "계속 녹음" }).click();
  await expect(page.getByRole("group", { name: "녹음 종료 확인" })).toHaveCount(0);
  expect(await page.getByRole("status").allTextContents()).not.toEqual(expect.arrayContaining([expect.stringMatching(/\d+:\d\d/)]));
  await page.screenshot({ path: "docs/verification/recording-ux-2026-09-29/s1-recording-synthetic.png", fullPage: true });
  await expect.poll(() => page.evaluate(() => (window as typeof window & { wakeRequests: number }).wakeRequests)).toBe(1);
  await page.evaluate(async () => {
    await (window as typeof window & { releaseWake: () => Promise<void> }).releaseWake();
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => page.evaluate(() => (window as typeof window & { wakeRequests: number }).wakeRequests)).toBe(2);
  expect(keyRequests).toBe(1);
  await expect.poll(async () => (await page.getByText(/이 기기에 저장됨/).textContent())?.includes("0:01")).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect(page.getByText(/녹음 화면을 떠나 녹음이 중단됐습니다/)).toBeVisible();
  await expect(page.locator(".recorder-steps [aria-current='step']")).toContainText("저장");
  await expect(page.getByRole("region", { name: "복구할 녹음" })).not.toContainText("합성 회의");
  await expect.poll(() => page.title()).toContain("⚠ 녹음 중단");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => page.title()).toBe(baseTitle);
  await page.getByRole("button", { name: "확인 구간 보기" }).click();
  await expect(page.getByText(/이 기기의 연속 확인 구간/)).toBeVisible();
  const confirmedLength = await page.getByText(/이 기기의 연속 확인 구간/).textContent();
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("button", { name: "확인하고 저장" })).toBeVisible();
  await expect(page.getByRole("button", { name: "확인하고 저장" })).toHaveClass(/button-secondary/);
  await page.screenshot({ path: "docs/verification/recording-ux-2026-09-29/s3-recovery-list-1440.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "docs/verification/recording-ux-2026-09-29/s8-recovery-list-390.png", fullPage: true });
  await page.getByRole("button", { name: "확인하고 저장" }).click();
  await expect(page.getByText(/이 기기의 연속 확인 구간/)).toHaveText(confirmedLength!);
  expect(keyRequests).toBe(2);
  await page.screenshot({ path: "docs/verification/browser-meeting-recording/step2-recovered-synthetic.png", fullPage: true });
  await page.getByRole("button", { name: "새 녹음 화면으로" }).click();
  await expect(page.getByRole("region", { name: "새 회의 녹음" })).toBeVisible();
  await expect(page.getByRole("button", { name: "확인하고 저장" })).toBeVisible();
  expect(discards).toBe(0);
});

test("form shows missing conditions and keyboard radio group", async ({ page }) => {
  await page.route("**/api/d/dept/reviews", route => route.fulfill({ json: { reviews: [], members: [] } }));
  await page.route("**/api/d/dept/recordings?recent=1", route => route.fulfill({ json: { recordings: [] } }));
  await page.route("**/api/d/dept/recordings", route => route.fulfill({ json: { recordings: [] } }));
  await page.goto("/?view=recorder");
  const start = page.getByRole("button", { name: "녹음 시작", exact: true });
  await expect(start).toBeDisabled();
  await expect(start).toHaveAttribute("aria-describedby", "recorder-start-blockers");
  await expect(page.locator("#recorder-start-blockers")).toContainText("회의 제목을 입력해 주세요.");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "docs/verification/recording-ux-2026-09-29/s3-form-1440.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "docs/verification/recording-ux-2026-09-29/s3-form-390.png", fullPage: true });
  await page.getByLabel("회의 제목").fill("새 회의");
  await expect(page.locator("#recorder-start-blockers")).not.toContainText("회의 제목을 입력해 주세요.");
  const microphone = page.getByRole("radio", { name: "마이크", exact: true });
  const shared = page.getByRole("radio", { name: "컴퓨터 소리 + 마이크" });
  await expect(microphone).toHaveAttribute("name", "recording-mode");
  await expect(shared).toHaveAttribute("name", "recording-mode");
  await microphone.focus();
  await page.keyboard.press("ArrowRight");
  await expect(shared).toBeChecked();
});

async function readyToStart(page: import("@playwright/test").Page, denyStart = false) {
  await page.addInitScript(({ denyStartInput }) => {
    const state = window as typeof window & { recordingTracks: MediaStreamTrack[] };
    state.recordingTracks = [];
    let calls = 0;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => {
      calls++;
      if (denyStartInput && calls === 2) throw new DOMException("Permission denied", "NotAllowedError");
      const context = new AudioContext();
      await context.resume();
      const oscillator = context.createOscillator();
      const destination = context.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      state.recordingTracks.push(...destination.stream.getTracks());
      return destination.stream;
    } });
  }, { denyStartInput: denyStart });
  await page.route("**/api/d/dept/reviews", route => route.fulfill({ json: {
    reviews: [], members: [{ user_id: "synthetic-user", display_name: "합성 녹음자", consented_at: new Date().toISOString() }],
  } }));
  await page.route("**/api/d/dept/recordings?recent=1", route => route.fulfill({ json: { recordings: [] } }));
  await page.goto("/?view=recorder");
  await page.getByLabel("회의 제목").fill("실패 경로 확인");
  await page.getByRole("checkbox", { name: /참석자 전원 녹음 동의/ }).check();
  await page.getByRole("button", { name: "5초 테스트 녹음" }).click();
  await expect(page.getByRole("meter", { name: "마이크 입력 크기" })).toBeVisible();
  await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/, { timeout: 12000 });
  await expect(page.getByText(/내 목소리가 들리는지 확인해 주세요/)).toBeVisible();
  await page.getByRole("checkbox", { name: /테스트를 듣고/ }).check();
}

test("confirmed stop restores navigation and tab title", async ({ page }) => {
  test.setTimeout(60_000);
  const key = Buffer.alloc(32, 7).toString("base64url");
  await page.route("**/api/d/dept/recordings", route => {
    if (route.request().method() === "POST") return route.fulfill({ status: 201, json: { ...route.request().postDataJSON(), state: "active", started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(), state_reason: null } });
    return route.fulfill({ json: { recordings: [] } });
  });
  await page.route("**/api/d/dept/recordings/*/key", route => route.fulfill({ json: { key } }));
  await readyToStart(page);
  const originalTitle = await page.title();
  await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await expect(page.getByRole("button", { name: "녹음 종료" })).toBeVisible();
  await expect(page.locator(".recorder-steps [aria-current='step']")).toContainText("녹음");
  await expect(page.getByRole("region", { name: "복구할 녹음" })).toContainText("녹음이 끝나면 다시 보여 줍니다.");
  await expect(page.getByRole("region", { name: "복구할 녹음" })).not.toContainText("합성 회의");
  await expect.poll(() => page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(true);
  let beforeUnloadDialogs = 0;
  page.on("dialog", async dialog => {
    if (dialog.type() === "beforeunload") { beforeUnloadDialogs++; await dialog.dismiss(); }
    else await dialog.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => beforeUnloadDialogs).toBe(1);
  expect(page.isClosed()).toBe(false);
  await page.getByRole("button", { name: "녹음 종료" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "녹음 종료 확인" })).toHaveCount(0);
  await page.getByRole("button", { name: "녹음 종료" }).click();
  await page.getByRole("button", { name: "녹음 끝내기" }).click();
  await expect(page.getByRole("button", { name: "음성 저장하고 받아쓰기" })).toBeVisible();
  await expect.poll(() => page.title()).toBe(originalTitle);
  expect(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  expect(beforeUnloadDialogs).toBe(1);
});

test("denied microphone never creates a server session and allows retry", async ({ page }) => {
  test.setTimeout(45_000);
  let starts = 0;
  await page.route("**/api/d/dept/recordings", route => {
    if (route.request().method() === "POST") starts++;
    return route.fulfill({ json: { recordings: [] } });
  });
  await readyToStart(page, true);
  await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("허용");
  await expect(page.getByRole("button", { name: "녹음 시작", exact: true })).toBeEnabled();
  expect(starts).toBe(0);
});

test("failed session creation stops selected input tracks", async ({ page }) => {
  test.setTimeout(45_000);
  let starts = 0;
  await page.route("**/api/d/dept/recordings", route => {
    if (route.request().method() === "POST") {
      starts++;
      return route.fulfill({ status: 403, json: { error: "녹음 권한을 확인해 주세요." } });
    }
    return route.fulfill({ json: { recordings: [] } });
  });
  await readyToStart(page);
  await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("권한");
  expect(starts).toBe(1);
  expect(await page.evaluate(() => (window as typeof window & { recordingTracks: MediaStreamTrack[] }).recordingTracks.every(track => track.readyState === "ended"))).toBe(true);
  await expect(page.getByRole("button", { name: "녹음 종료" })).toHaveCount(0);
});

test("denied key discards the new session and stops input tracks", async ({ page }) => {
  test.setTimeout(45_000);
  let starts = 0;
  let discards = 0;
  let releaseKey!: () => void;
  const keyGate = new Promise<void>(resolve => { releaseKey = resolve; });
  await page.route("**/api/d/dept/recordings", route => {
    if (route.request().method() === "POST") {
      starts++;
      return route.fulfill({ status: 201, json: { ...route.request().postDataJSON(), state: "active", started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(), state_reason: null } });
    }
    return route.fulfill({ json: { recordings: [] } });
  });
  await page.route("**/api/d/dept/recordings/*/key", async route => {
    await keyGate;
    return route.fulfill({ status: 403, json: { error: "recording_key_forbidden" } });
  });
  await page.route("**/api/d/dept/recordings/*/discard", route => { discards++; return route.fulfill({ json: {} }); });
  await readyToStart(page);
  await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("녹음 준비 중");
  await expect(page.getByLabel("회의 제목")).toBeDisabled();
  releaseKey();
  await expect(page.getByRole("alert")).toContainText("동의 상태");
  await expect(page.getByRole("region", { name: "새 회의 녹음" }).getByRole("alert")).toContainText("동의 상태");
  await expect(page.getByRole("region", { name: "새 회의 녹음" }).getByRole("alert")).toBeFocused();
  await expect(page.locator("main")).not.toContainText("recording_key_forbidden");
  expect(starts).toBe(1);
  expect(discards).toBe(1);
  expect(await page.evaluate(() => (window as typeof window & { recordingTracks: MediaStreamTrack[] }).recordingTracks.every(track => track.readyState === "ended"))).toBe(true);
});

test("failed storage preflight discards the new session before capture", async ({ page }) => {
  test.setTimeout(45_000);
  let starts = 0;
  let keyRequests = 0;
  let discards = 0;
  const key = Buffer.alloc(32, 7).toString("base64url");
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, "estimate", { configurable: true,
      value: async () => ({ quota: 64 * 1024 * 1024, usage: 1 }) });
  });
  await page.route("**/api/d/dept/recordings", route => {
    if (route.request().method() === "POST") {
      starts++;
      return route.fulfill({ status: 201, json: { ...route.request().postDataJSON(), state: "active", started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(), state_reason: null } });
    }
    return route.fulfill({ json: { recordings: [] } });
  });
  await page.route("**/api/d/dept/recordings/*/key", route => { keyRequests++; return route.fulfill({ json: { key } }); });
  await page.route("**/api/d/dept/recordings/*/discard", route => { discards++; return route.fulfill({ json: {} }); });
  await readyToStart(page);
  await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("저장 공간");
  expect(starts).toBe(1);
  expect(keyRequests).toBe(1);
  expect(discards).toBe(1);
  expect(await page.evaluate(() => (window as typeof window & { recordingTracks: MediaStreamTrack[] }).recordingTracks.every(track => track.readyState === "ended"))).toBe(true);
  await expect(page.getByRole("button", { name: "녹음 종료" })).toHaveCount(0);
});
