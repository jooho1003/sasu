import { expect, test } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { missingEnv, SEED_LEAD, signInSeedUser } from "./support/auth";

loadEnvConfig(process.cwd());

for (const width of [1440, 390]) {
  test(`새 탐색·기록 분류·질문 선택 ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    const writes: string[] = [];
    const errors: string[] = [];
    const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
    page.on("request", (request) => {
      if (
        new URL(request.url()).origin === appOrigin &&
        !["GET", "HEAD", "OPTIONS"].includes(request.method())
      )
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    page.on("pageerror", (error) => errors.push(error.name));
    const capture = async (name: string) => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${name}-${width}.png`),
        fullPage: true,
      });
    };

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "사수는 결정을 만듭니다",
    );
    await capture("home");
    await page
      .getByRole("link", { name: "데모 보기", exact: true })
      .first()
      .click();
    await page.waitForURL(/\/demo(?:\?|$)/u);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "부서가 다르면",
    );
    await expect(page.getByText("추천 · 풍부한 영업 기록", { exact: true })).toBeVisible();
    await capture("demo");
    await page
      .getByRole("region", { name: "데모 부서 선택" })
      .getByRole("link")
      .first()
      .click();
    const menu = page.getByRole("navigation", { name: "부서 메뉴" });
    await expect(
      menu.getByRole("link", { name: "대시보드", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("heading", { name: "결정 카드", exact: false }),
    ).toBeVisible();
    const cardTop = await page
      .locator("#demo-cards-heading")
      .evaluate((element) => element.getBoundingClientRect().top);
    const recordsTop = await page
      .locator("#demo-items-heading")
      .evaluate((element) => element.getBoundingClientRect().top);
    expect(cardTop).toBeLessThan(recordsTop);
    const categories = page
      .getByRole("group", { name: "기록 분류 선택" })
      .getByRole("button");
    expect(await categories.count()).toBeGreaterThan(1);
    const previousContent = await page.locator("#demo-record-list").innerText();
    await categories.last().click();
    await expect(categories.last()).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#demo-record-list")).not.toHaveText(
      previousContent,
    );
    const record = page.locator("#demo-record-list .record-item").first();
    const original=record.getByRole("link",{name:/원문 보기/});
    await expect(original).toHaveAttribute("href", /\/documents\?source=/);
    await original.click();await expect(page.locator(".demo-source > summary")).toBeVisible();
    await page.goBack();
    const sources = page.getByRole("group", { name: "기록 출처 선택" }).getByRole("button");
    await sources.nth(2).click();
    await expect(sources.nth(2)).toHaveAttribute("aria-pressed", "true");
    await sources.first().click();
    await categories.first().click();
    await capture("dashboard");

    await page.locator('a[href*="/cards/"]:visible').first().click();
    await expect(page.locator("q").first()).toBeVisible();
    await capture("card");
    await menu.getByRole("link", { name: "결정 기록", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("결정 기록");
    await capture("ledger");
    await menu.getByRole("link", { name: "묻기", exact: true }).click();
    await expect(
      menu.getByRole("link", { name: "묻기", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    const questions = page
      .getByRole("group", { name: "준비된 질문 선택" })
      .getByRole("button");
    await expect(questions.first()).toBeVisible();
    expect(await questions.count()).toBeGreaterThan(1);
    for (const question of await questions.all()) {
      const title = await question.innerText();
      await question.click();
      await expect(question).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("#demo-answer h2")).toHaveText(title);
      if (await page.locator("#demo-answer").getByText("근거 없음", { exact: true }).count()) {
        await expect(page.locator("#demo-answer q")).toHaveCount(0);
      } else {
        await expect(page.locator("#demo-answer q").first()).toBeVisible();
      }
    }
    await questions.first().click();
    await capture("ask");
    await page.goto("/login");
    await expect(
      page.getByRole("textbox", { name: "이메일", exact: true }),
    ).toBeVisible();
    await capture("login");
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("모바일 메뉴로 로그인에 접근한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByText("메뉴 열기", { exact: true }).click();
  await expect(page.getByText("메뉴 닫기", { exact: true })).toBeVisible();
  await page
    .getByRole("navigation", { name: "모바일 메뉴" })
    .getByRole("link", { name: "로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/u);
});

for (const width of [1440, 390]) {
  test(`로그인한 부서의 공통 탐색과 읽기 화면 ${width}px`, async ({
    context,
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    test.skip(
      missingEnv([
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "SEED_LEAD_EMAIL",
        "SEED_LEAD_PASSWORD",
      ]).length > 0,
      "시드 계정이 필요합니다.",
    );
    await signInSeedUser(context, baseURL!, SEED_LEAD);
    await page.setViewportSize({ width, height: 900 });
    const writes: string[] = [];
    const errors: string[] = [];
    page.on("request", (request) => {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method()))
        writes.push(request.method());
    });
    page.on("pageerror", (error) => errors.push(error.name));
    const base = "/d/22222222-2222-4222-8222-222222222222";
    for (const [suffix, label] of [
      ["", "대시보드"],
      ["/ask", "묻기"],
      ["/ledger", "결정 기록"],
      ["/reviews", "올린 자료"],
      ["/documents", "문서"],
      ["/roles", "문서 점수표"],
      ["/retention", "기록 보관"],
      ["/settings", "설정"],
    ]) {
      await page.goto(`${base}${suffix}`);
      const departmentMenu = page.getByRole("navigation", { name: "부서 메뉴" });
      const activeLink = departmentMenu.getByRole("link", { name: label, exact: true });
      if (width < 768 && await activeLink.count() === 0) {
        await departmentMenu.locator('summary[aria-label="부서 메뉴 더보기"]').click();
      }
      await expect(departmentMenu.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
      if (suffix === "/settings") {
        // Settings also reads the connected Slack channel list.
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          "수집 범위와 동의를 확인하세요",
          { timeout: 30_000 },
        );
      } else {
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}
