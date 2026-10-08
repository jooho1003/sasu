import { test, expect } from "@playwright/test";

test("real Google tag sends clean page and CTA payloads under enforced CSP", async ({ page }) => {
  const payloads: string[] = [];
  await page.route(/https:\/\/(?:www|region1)\.google-analytics\.com\/g\/collect/u, async (route) => {
    payloads.push(`${route.request().url()} ${route.request().postData() ?? ""}`);
    await route.fulfill({ status: 204 });
  });
  await page.goto("/?token_hash=PRIVATE_CANARY#PRIVATE_CANARY");
  expect(payloads).toEqual([]);
  await page.getByRole("button", { name: "방문 분석 허용", exact: true }).click();
  await expect.poll(() => payloads.some((payload) => payload.includes("en=page_view")), { timeout: 30_000 }).toBe(true);
  expect(decodeURIComponent(payloads.join("\n"))).not.toContain("PRIVATE_CANARY");
  expect(decodeURIComponent(payloads.join("\n"))).toContain("dl=https://getsasu.com/");
  await page.context().route("https://app.notion.com/**", (route) => route.abort());
  await page.locator('a[data-analytics-id="guide"]').first().click();
  await expect.poll(() => payloads.some((payload) => payload.includes("en=public_cta_click")), { timeout: 20_000 }).toBe(true);
  expect(decodeURIComponent(payloads.join("\n"))).not.toMatch(/PRIVATE_CANARY|app\.notion\.com/u);
  const sent = payloads.length;
  await page.locator(".site-login").click();
  await expect(page).toHaveURL(/\/login/u);
  await expect(page.locator("#sasu-ga4")).toHaveCount(0);
  expect(payloads).toHaveLength(sent);
});

test("real Sentry browser error envelope excludes private URL and original content", async ({ page }) => {
  const envelopes: string[] = [];
  await page.route("https://*.sentry.io/**/envelope/**", async (route) => {
    envelopes.push(route.request().postData() ?? "");
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("/login?token_hash=PRIVATE_CANARY");
  await expect.poll(() => page.evaluate(() => Object.keys(window).includes("__SENTRY__")), { timeout: 30_000 }).toBe(true);
  // A synthetic browser error exercises the initialized global handler, without a product debug route.
  await page.evaluate(() => window.dispatchEvent(new ErrorEvent("error", { message: "PRIVATE_CANARY", error: new Error("PRIVATE_CANARY user@example.test 업무 원문"), filename: "https://getsasu.com/_next/static/chunks/test.js?PRIVATE_CANARY", lineno: 10, colno: 2 })));
  await expect.poll(() => envelopes.length, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(envelopes.join("\n")).toContain("application_error");
  expect(envelopes.join("\n")).not.toMatch(/PRIVATE_CANARY|user@example|업무 원문|token_hash|\/login/u);
  const event = JSON.parse(envelopes[0].split("\n")[2]);
  expect(event.sdk.settings.infer_ip).toBe("never");
});
