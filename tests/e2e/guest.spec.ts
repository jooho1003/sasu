import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const REAL_DEPT = "22222222-2222-4222-8222-222222222222";

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`게스트 대시보드·카드·원장·묻기 완주 ${viewport.width}px`, async ({ page }, testInfo) => {
    // 운영 URL에서는 데모 부서 4곳을 도는 데 기본 30초를 넘는다(2026-09-15 O8 실측 31~39초).
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    const writes: string[] = [];
    const errors: string[] = [];
    page.on("request", request => {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(request.method());
    });
    page.on("pageerror", error => errors.push(error.name));
    await page.goto("/demo");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("부서가 다르면");
    const departments = await page.locator('a[href^="/demo/d/"]').evaluateAll(links => links.map(link => link.getAttribute("href")!).filter(href => /^\/demo\/d\/[0-9a-f-]{36}$/u.test(href)));
    expect(departments.length).toBeGreaterThanOrEqual(2);
    for (const dept of departments) {
      await page.goto(dept);
      const card = page.locator('a[href*="/cards/"]').first();
      await expect(card).toBeVisible();
      await card.click();
      await page.waitForURL(/\/cards\//u, { waitUntil: "commit" });
      await expect(page.locator("q").first()).toBeVisible();
      await page.getByRole("link", { name: "원장", exact: true }).click();
      await page.waitForURL(/\/ledger$/u, { waitUntil: "commit" });
      await expect(page.getByRole("heading", { level: 1 })).toContainText("원장");
      await page.getByRole("link", { name: "묻기", exact: true }).click();
      await page.waitForURL(/\/ask$/u, { waitUntil: "commit" });
      await expect(page.getByRole("heading", { level: 1 })).toContainText("묻기");
      const articles = page.locator("article");
      expect(await articles.count()).toBeGreaterThan(0);
      for (const article of await articles.all()) {
        await expect(article.locator("q")).toBeVisible();
        await expect(article.locator("q")).not.toHaveText("인용 없음");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(page.locator("body")).not.toContainText(REAL_DEPT);
    }
    const screenshotPath = testInfo.outputPath(`guest-${viewport.width}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach(`guest-${viewport.width}`, { path: screenshotPath, contentType: "image/png" });
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("게스트는 실제 부서에 접근하지 못하고 잘못된 서명은 거부된다", async ({ request }) => {
  for (const suffix of ["", "/ask", "/ledger"]) {
    expect((await request.get(`/demo/d/${REAL_DEPT}${suffix}`)).status()).toBe(404);
  }
  const slack = await request.post("/api/slack/events", {
    data: { type: "event_callback", event_id: "invalid-signature-qa" },
    headers: { "x-slack-signature": "v0=invalid", "x-slack-request-timestamp": String(Math.floor(Date.now() / 1000)) },
  });
  expect(slack.status()).toBe(401);
  expect((await request.post("/api/jobs/run", { headers: { "x-jobs-secret": "invalid-qa-secret" } })).status()).toBe(401);
});

test("게스트 열람 전후 AI 호출·DB 행 수가 증가하지 않는다", async ({ page }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  test.skip(!url || !key, "DB 카운트 검증용 서버 키가 필요합니다 (브라우저에 전달하지 않음).");
  const db = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  const tables = ["llm_calls", "jobs", "items", "answers", "decisions", "citations"];
  const counts = async () => Promise.all(tables.map(async table => {
    const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
    expect(error).toBeNull();
    expect(count).not.toBeNull();
    return count;
  }));
  const before = await counts();
  await page.goto("/demo");
  const departments = await page.locator('a[href^="/demo/d/"]').evaluateAll(links => links.map(link => link.getAttribute("href")!).filter(href => /^\/demo\/d\/[0-9a-f-]{36}$/u.test(href)));
  expect(departments.length).toBeGreaterThanOrEqual(2);
  for (const dept of departments) {
    for (const suffix of ["", "/ledger", "/ask"]) {
      expect((await page.goto(`${dept}${suffix}`))?.status()).toBe(200);
    }
  }
  expect(await counts()).toEqual(before);
});
