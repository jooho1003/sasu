import { expect, test } from "@playwright/test";

test("기획팀은 직접 URL로 카드·원장·답변을 열 수 있다", async ({ page }, testInfo) => {
  await page.goto("/demo/d/dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  await expect(page.locator(".workspace-topbar")).toContainText("기획");
  await page.locator('a[href*="/cards/"]').first().click();
  await expect(page.locator("q").first()).toBeVisible();
  await page.getByRole("link", { name: "원장", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("원장");
  await page.getByRole("link", { name: "묻기", exact: true }).click();
  await expect(page.locator("article q").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("planning-direct.png"), fullPage: true });
});

// 사용자 요청의 세 팀을 각각 검증한다. 없는 디자인팀을 다른 팀으로 대체하지 않는다.
for (const team of ["기획", "디자인", "개발"]) {
  test(`${team}팀 데모 진입 → 카드 → 원장 → 근거 답변`, async ({ page }, testInfo) => {
    await page.goto("/demo");
    const entry = page.locator('a[href^="/demo/d/"]').filter({ hasText: team });
    await expect(entry, `${team}팀 데모가 실제로 제공되어야 합니다`).toHaveCount(1);
    await entry.click();
    await page.locator('a[href*="/cards/"]').first().click();
    await expect(page.locator("q").first()).toBeVisible();
    await page.getByRole("link", { name: "원장", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("원장");
    await page.getByRole("link", { name: "묻기", exact: true }).click();
    await expect(page.locator("article q").first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${team}-workflow.png`), fullPage: true });
  });
}
