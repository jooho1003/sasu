import { expect, test } from "@playwright/test";

test("synthetic input completes test, session preflight, recording and reload recovery", async ({ page }) => {
  test.setTimeout(90_000);
  const key = Buffer.alloc(32, 7).toString("base64url");
  let keyRequests = 0;
  const sessions: Record<string, unknown>[] = [];
  await page.addInitScript(() => {
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
  await page.route("**/api/d/dept/recordings/*/key", route => { keyRequests++; return route.fulfill({ json: { key } }); });
  await page.goto("/?view=recorder");
  await expect(page.getByLabel("회의 제목")).toBeVisible();
  await page.getByLabel("회의 제목").fill("합성 회의");
  await page.getByRole("checkbox", { name: /참석자 전원 녹음 동의/ }).check();
  await page.getByRole("button", { name: "5초 테스트 녹음" }).click();
  await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/, { timeout: 12000 });
  await page.getByRole("checkbox", { name: /테스트를 듣고/ }).check();
  await page.getByRole("button", { name: "녹음 준비" }).click();
  await expect(page.getByRole("button", { name: "입력 장치 선택하고 녹음 시작" })).toBeVisible();
  await page.screenshot({ path: "docs/verification/browser-meeting-recording/step2-prepared-synthetic.png", fullPage: true });
  await page.getByRole("button", { name: "입력 장치 선택하고 녹음 시작" }).click();
  await expect(page.getByRole("button", { name: "녹음 종료" })).toBeVisible();
  expect(keyRequests).toBe(2);
  await expect.poll(async () => (await page.getByText(/이 기기에 확인 저장/).textContent())?.includes("0:01")).toBe(true);
  await page.getByRole("button", { name: "녹음 종료" }).click();
  await expect(page.getByText(/이 기기의 연속 확인 구간/)).toBeVisible();
  const confirmedLength = await page.getByText(/이 기기의 연속 확인 구간/).textContent();
  await page.reload();
  await expect(page.getByRole("button", { name: "녹음 이어서 확인" })).toBeVisible();
  await page.getByRole("button", { name: "녹음 이어서 확인" }).click();
  await expect(page.getByText(/이 기기의 연속 확인 구간/)).toHaveText(confirmedLength!);
  expect(keyRequests).toBe(3);
  await page.screenshot({ path: "docs/verification/browser-meeting-recording/step2-recovered-synthetic.png", fullPage: true });
});
