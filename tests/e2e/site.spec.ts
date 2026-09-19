import { expect, test } from "@playwright/test";

test.describe("공개 메인 사이트", () => {
  test("핵심 메시지와 데모 동선을 정적으로 제공한다", async ({ page }) => {
    const writeRequests: string[] = [];
    page.on("request", (request) => {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        writeRequests.push(`${request.method()} ${request.url()}`);
      }
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "사수는 결정을 만듭니다",
    );
    await expect(page.getByRole("link", { name: "데모 보기" }).first()).toHaveAttribute(
      "href",
      "/demo",
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /^https?:\/\//u,
    );
    expect(writeRequests).toEqual([]);
  });

  test("모바일에서 가로로 넘치지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });

  test("개인정보 안내와 검색 노출 경계를 제공한다", async ({ page, request }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "개인정보 처리 안내",
    );
    await expect(page.getByText("법률 검토 전 초안", { exact: false })).toBeVisible();

    const robots = await request.get("/robots.txt");
    expect(await robots.text()).toContain("Disallow: /admin");
    expect(await robots.text()).toContain("Disallow: /api/");

    const sitemap = await request.get("/sitemap.xml");
    expect(await sitemap.text()).toContain("/privacy");
  });
});
