import { expect, test, type Locator, type Page } from "@playwright/test";

async function tabTo(page: Page, target: Locator) {
  for (let index = 0; index < 20; index++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error("키보드 Tab 이동으로 대상에 도달하지 못했습니다.");
}

test("녹음 양식을 키보드만으로 시작·일시정지·종료·저장 버튼까지 이동한다", async ({ page }) => {
  test.setTimeout(120_000);
  const key = Buffer.alloc(32, 7).toString("base64url");
  const sessions: Record<string, unknown>[] = [];
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => {
      const context = new AudioContext();
      await context.resume();
      const source = context.createOscillator();
      const destination = context.createMediaStreamDestination();
      source.connect(destination);
      source.start();
      return destination.stream;
    } });
  });
  await page.route("**/api/d/dept/reviews", route => route.fulfill({ json: {
    reviews: [], members: [{ user_id: "synthetic-user", display_name: "합성 녹음자", consented_at: new Date().toISOString() }],
  } }));
  await page.route("**/api/d/dept/recordings?recent=1", route => route.fulfill({ json: { recordings: [] } }));
  await page.route("**/api/d/dept/recordings", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { recordings: sessions } });
    const input = route.request().postDataJSON();
    const session = { ...input, state: "active", started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(), state_reason: null };
    sessions.push(session);
    return route.fulfill({ status: 201, json: session });
  });
  await page.route("**/api/d/dept/recordings/*/key", route => route.fulfill({ json: { key } }));
  await page.goto("/?view=recorder");
  const title = page.getByRole("textbox", { name: "회의 제목" });
  await tabTo(page, title);
  await page.keyboard.type("키보드 합성 회의");
  const consent = page.getByRole("checkbox", { name: /참석자 전원 녹음 동의/ });
  await tabTo(page, consent);
  await page.keyboard.press("Space");
  await expect(consent).toBeChecked();
  const testButton = page.getByRole("button", { name: "5초 테스트 녹음" });
  await tabTo(page, testButton);
  await page.keyboard.press("Enter");
  await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/, { timeout: 15000 });
  const heard = page.getByRole("checkbox", { name: /테스트를 듣고/ });
  await tabTo(page, heard);
  await page.keyboard.press("Space");
  const start = page.getByRole("button", { name: "녹음 시작", exact: true });
  await tabTo(page, start);
  await page.keyboard.press("Enter");
  const pause = page.getByRole("button", { name: "녹음 잠시 멈추기" });
  await expect(pause).toBeVisible({ timeout: 15000 });
  await tabTo(page, pause);
  await page.keyboard.press("Enter");
  const resume = page.getByRole("button", { name: "녹음 다시 시작" });
  await expect(resume).toBeVisible();
  await page.keyboard.press("Enter");
  const stop = page.getByRole("button", { name: "녹음 종료" });
  await tabTo(page, stop);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "녹음 종료 확인" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "녹음 종료 확인" })).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "녹음 종료 확인" })).toBeVisible();
  await tabTo(page, page.getByRole("button", { name: "녹음 끝내기" }));
  await page.keyboard.press("Enter");
  const save = page.getByRole("button", { name: "음성 저장하고 받아쓰기" });
  await expect(save).toBeVisible({ timeout: 15000 });
  await tabTo(page, save);
  await expect(save).toBeFocused();
  await page.screenshot({ path: "docs/verification/recording-ux-2026-09-29/s8-keyboard-focus.png", fullPage: true });
});
