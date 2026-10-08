import { test, expect } from "@playwright/test";

test("public metadata and FAQ match, private pages and resources are noindex", async ({ page, request }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https:\/\/getsasu\.com\/?$/u);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index, follow/u);
  const graph = await page.locator("#sasu-structured-data").textContent();
  const faq = JSON.parse(graph!)["@graph"].find((entry: { "@type": string }) => entry["@type"] === "FAQPage");
  for (const entry of faq.mainEntity) {
    const question = page.locator("#faq details").filter({ hasText: entry.name });
    await expect(question.locator("summary")).toHaveText(entry.name);
    await question.locator("summary").click();
    await expect(question.locator("p")).toHaveText(entry.acceptedAnswer.text);
  }
  await page.screenshot({ path: "docs/verification/52-search-observability/public-search.png", fullPage: false });
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Sitemap: https://getsasu.com/sitemap.xml");
  const sitemap = await request.get("/sitemap.xml");
  expect(await sitemap.text()).toContain("https://getsasu.com/privacy");
  expect(await sitemap.text()).not.toContain("/d/");
  const llms = await request.get("/llms.txt");
  expect(llms.status()).toBe(200);
  expect(await llms.text()).toContain("https://getsasu.com/demo");
  const login = await request.get("/login");
  expect(login.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
  await page.goto("/privacy");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://getsasu.com/privacy");
  // The existing demo query keeps this check read-only when reviewer auto-login is enabled.
  const demo = await request.get("/demo?demo=metadata", { maxRedirects: 0 });
  expect(demo.status()).toBe(200);
  expect(await demo.text()).toContain('rel="canonical" href="https://getsasu.com/demo"');
});

test("GA4 starts only after consent and sends clean public payloads", async ({ page }) => {
  const gaRequests: string[] = [];
  page.on("request", (request) => { if (/google-analytics|googletagmanager/u.test(request.url())) gaRequests.push(request.url()); });
  await page.route("https://www.googletagmanager.com/**", (route) => route.fulfill({ contentType: "text/javascript", body: "/* isolated GA4 transport */" }));
  await page.goto("/?token_hash=PRIVATE_CANARY#PRIVATE_CANARY");
  await expect(page.getByRole("button", { name: "방문 분석 허용", exact: true })).toBeVisible();
  expect(gaRequests).toEqual([]);
  await page.getByRole("button", { name: "방문 분석 허용", exact: true }).click();
  await expect(page.locator("#sasu-ga4")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.dataLayer?.length ?? 0)).toBeGreaterThan(3);
  const data = await page.evaluate(() => JSON.stringify(window.dataLayer));
  expect(data).not.toContain("PRIVATE_CANARY");
  expect(data).toContain('"send_page_view":false');
  expect(data).toContain('"page_referrer":""');
  await page.context().route("https://app.notion.com/**", (route) => route.abort());
  await page.locator('a[data-analytics-id="guide"]').first().click();
  const clickData = await page.evaluate(() => JSON.stringify(window.dataLayer));
  expect(clickData).toContain("public_cta_click");
  expect(clickData).not.toMatch(/PRIVATE_CANARY|link_url|app\.notion\.com/u);
  await page.getByRole("button", { name: "방문 분석 설정", exact: true }).click();
  await page.context().addCookies([{ name: "_ga", value: "synthetic", url: "http://127.0.0.1:3192" }, { name: "_ga_TEST123", value: "synthetic", url: "http://127.0.0.1:3192" }]);
  await page.getByRole("button", { name: "허용 안 함", exact: true }).click();
  await expect(page.locator("#sasu-ga4")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("sasu-analytics-consent"))).toBe("denied");
  expect((await page.context().cookies()).filter((cookie) => cookie.name.startsWith("_ga"))).toEqual([]);
});

test("initial denial and unavailable storage never load GA4", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "허용 안 함", exact: true }).click();
  await expect(page.locator("#sasu-ga4")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "방문 분석 설정", exact: true })).toBeVisible();
  await expect(page.locator("#sasu-ga4")).toHaveCount(0);
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error("storage_unavailable"); };
    Storage.prototype.setItem = () => { throw new Error("storage_unavailable"); };
  });
  await page.reload();
  await page.getByRole("button", { name: "방문 분석 허용", exact: true }).click();
  await expect(page.locator("#sasu-ga4")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "방문 분석 허용", exact: true })).toBeVisible();
});

test("private navigation removes GA4 before rendering the login page", async ({ page }) => {
  await page.route("https://www.googletagmanager.com/**", (route) => route.fulfill({ contentType: "text/javascript", body: "/* isolated GA4 transport */" }));
  await page.goto("/");
  await page.getByRole("button", { name: "방문 분석 허용", exact: true }).click();
  await expect(page.locator("#sasu-ga4")).toHaveCount(1);
  await page.locator(".site-login").click();
  await expect(page).toHaveURL(/\/login/u);
  await expect(page.locator("#sasu-ga4")).toHaveCount(0);
  expect(await page.evaluate(() => typeof window.gtag)).toBe("undefined");
});
