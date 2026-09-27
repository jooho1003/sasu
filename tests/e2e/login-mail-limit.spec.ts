import { expect, test } from "@playwright/test";

test("로그인 메일 발송 한도는 주소 오류로 안내하지 않는다", async ({ page }) => {
  await page.route("**/auth/v1/otp**", (route) =>
    route.fulfill({
      status: route.request().method() === "OPTIONS" ? 204 : 429,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "content-type": "application/json",
        "x-supabase-api-version": "2024-01-01",
      },
      body: route.request().method() === "OPTIONS" ? "" : JSON.stringify({
        code: "over_email_send_rate_limit",
        msg: "rate limit exceeded",
      }),
    }),
  );

  await page.goto("/login");
  await page.getByRole("textbox", { name: "이메일", exact: true }).fill("pilot@example.com");
  await page.getByRole("button", { name: "로그인 링크 받기" }).click();

  await expect(page.locator("p[role=alert]")).toHaveText(
    "로그인 요청이 많아 메일을 보낼 수 없습니다. 잠시 후 다시 시도해 주세요.",
  );
});
