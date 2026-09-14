import { expect, test } from "@playwright/test";

for (const variant of [{ width: 1440, height: 960, mode: "map" }, { width: 1440, height: 960, mode: "list" }, { width: 390, height: 844, mode: "list" }]) {
  test(`공간 오피스 3퀘스트 완주·격리 ${variant.width}px ${variant.mode}`, async ({ page, context }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(variant);
    const errors: string[] = [], serviceRequests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (["fetch", "xhr", "eventsource"].includes(request.resourceType()) || request.url().includes("/api/") || request.url().includes("supabase") || !["GET", "HEAD", "OPTIONS"].includes(request.method())) serviceRequests.push(request.url());
    });
    await page.goto("/trailers");
    const canvas = page.getByLabel("오피스 월드");
    await expect(canvas).toHaveAttribute("data-ready", "true");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    if (variant.mode === "map") await page.screenshot({ path: "docs/verification/trailer-world-intro.png" });
    await page.getByRole("button", { name: "노란 니트" }).click();
    await expect(page.getByRole("button", { name: "노란 니트" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "오피스 입장하기" }).click();
    if (variant.mode === "map") await page.screenshot({ path: "docs/verification/trailer-world-office.png" });
    if (variant.mode === "list") await page.getByRole("button", { name: "목록형 모드로 전환" }).click();
    const dialog = page.getByRole("dialog");
    const detail = page.getByRole("region", { name: "장소 상세" });
    const close = async () => { if (await dialog.isVisible()) await page.getByRole("button", { name: "닫고 오피스로 돌아가기" }).click(); };
    const visit = async (name: string) => {
      await close();
      if (variant.mode === "map") {
        await page.getByRole("button", { name: "장소 찾아가기" }).click();
        await page.getByRole("button", { name: `${name}로 걸어가기`, exact: true }).click();
        await expect(dialog).toBeVisible({ timeout: 25_000 });
      } else await page.getByRole("navigation", { name: "오피스 장소", exact: true }).getByRole("button", { name: new RegExp(name) }).click();
      await expect(dialog.getByRole("heading", { level: 2 })).toContainText(name);
    };

    for (let index = 0; index < 3; index++) {
      await visit("서고");
      await expect(detail).toContainText("단서 수첩에 담았어요");
      if (variant.mode === "list") { await visit("회의실"); await visit("메신저 단말"); }
      for (const room of ["운영 사무실", "협업 사무실"]) {
        await visit(room);
        await detail.getByRole("button").first().click();
        await expect(detail).toContainText("사실집 근거");
        if (variant.mode === "map" && index === 0 && room === "운영 사무실") await page.screenshot({ path: "docs/verification/trailer-world-dialogue.png" });
      }
      await visit("팀장실");
      await detail.getByRole("button", { name: "결정하고 기록실 열기" }).click();
      await expect(detail.getByRole("alert")).toBeVisible();
      const notebook = detail.getByRole("region", { name: "단서 수첩" });
      await expect(notebook.getByRole("checkbox")).toHaveCount(variant.mode === "map" ? 3 : 5);
      await notebook.getByRole("checkbox").first().check();
      await detail.getByRole("radio").first().check();
      await detail.getByLabel("결정 이유").fill(`거래 관계와 일정의 영향을 고려한 결정 ${index + 1}입니다.`);
      // Text input must not become WASD game movement while the native dialog is open.
      const before = await canvas.getAttribute("data-x");
      await detail.getByLabel("결정 이유").press("a");
      expect(await canvas.getAttribute("data-x")).toBe(before);
      await close();
      await page.getByRole("button", { name: variant.mode === "map" ? "목록형 모드로 전환" : "맵 모드로 전환" }).click();
      await page.getByRole("button", { name: variant.mode === "map" ? "맵 모드로 전환" : "목록형 모드로 전환" }).click();
      await visit("팀장실");
      await expect(detail.getByLabel("결정 이유")).toHaveValue(new RegExp(`결정 ${index + 1}`));
      await expect(detail.getByRole("checkbox").first()).toBeChecked();
      await detail.getByRole("button", { name: "결정하고 기록실 열기" }).click();
      await expect(dialog.getByRole("heading", { name: "기록실", exact: true })).toBeVisible();
      await expect(detail).toContainText("가상 팀이 내린 결정");
      if (variant.width === 390 && index === 0) await page.screenshot({ path: "docs/verification/trailer-world-mobile-list.png" });
      await detail.getByRole("button", { name: index === 2 ? "전체 체험 돌아보기" : "다음 퀘스트" }).click();
    }
    await expect(page.getByRole("heading", { level: 1 })).toContainText("일하고 싶나요");
    await expect(page.getByRole("article")).toHaveCount(3);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, overflow: document.documentElement.scrollWidth > innerWidth }))).toEqual({ local: 0, session: 0, overflow: false });
    expect(await context.cookies()).toEqual([]); expect(serviceRequests).toEqual([]); expect(errors).toEqual([]);
    await page.getByRole("button", { name: "처음부터 다시 체험하기" }).click();
    await page.getByRole("button", { name: "오피스 입장하기" }).click();
    await page.getByRole("button", { name: /^단서 수첩/ }).click();
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  });
}

test("실제 키보드·클릭 이동, 근접 도착 후 대화, 새로고침 초기화", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/trailers"); await page.getByRole("button", { name: "오피스 입장하기" }).click();
  const canvas = page.getByLabel("오피스 월드");
  await expect(canvas).toHaveAttribute("data-ready", "true"); await canvas.focus();
  const bounds = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await expect(canvas).toHaveAttribute("data-walking", "true");
  expect(Number(await canvas.getAttribute("data-y"))).toBeGreaterThan(730);
  await page.keyboard.down("w");
  await expect.poll(async () => Number(await canvas.getAttribute("data-y"))).toBeLessThan(650);
  await page.keyboard.up("w");
  await page.keyboard.press("f");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const startX = Number(await canvas.getAttribute("data-x"));
  await page.getByRole("button", { name: "장소 찾아가기" }).click();
  await page.getByRole("button", { name: "운영 사무실로 걸어가기", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-walking", "true");
  expect(Math.abs(Number(await canvas.getAttribute("data-x")) - startX)).toBeLessThan(50);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("dialog")).toContainText("지훈");
  expect(Number(await canvas.getAttribute("data-x"))).toBeLessThan(400);
  await page.getByRole("button", { name: "닫고 오피스로 돌아가기" }).click();
  await page.reload(); await expect(page.getByRole("button", { name: "오피스 입장하기" })).toBeVisible();
});

test("모바일 월드 터치 이동·수첩·Escape 복귀", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/trailers");
  await page.getByRole("button", { name: "오피스 입장하기" }).click();
  const canvas = page.getByLabel("오피스 월드"); await expect(canvas).toHaveAttribute("data-ready", "true");
  const up = page.getByRole("button", { name: "위로 이동", exact: true });
  const upBounds = (await up.boundingBox())!;
  await page.mouse.move(upBounds.x + upBounds.width / 2, upBounds.y + upBounds.height / 2);
  await page.mouse.down();
  await expect.poll(async () => Number(await canvas.getAttribute("data-y"))).toBeLessThan(710);
  await page.mouse.up();
  await page.screenshot({ path: "docs/verification/trailer-world-mobile.png" });
  await page.getByRole("button", { name: /^단서 수첩/ }).click();
  await expect(page.getByRole("dialog")).toContainText("아직 수첩이 비어");
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
