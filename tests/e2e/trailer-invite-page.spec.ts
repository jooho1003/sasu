import { expect, test } from "@playwright/test";

const token = "a".repeat(64);
const unavailable = "링크를 열 수 없습니다. 주소를 확인하거나 채용 담당자에게 문의하세요";

test("플래그가 꺼지면 지원자 초대 페이지는 404다", async ({ request }) => {
  const response = await request.get(`http://localhost:3108/t/i/${token}`);
  expect(response.status()).toBe(404);
});

test("존재하지 않는 링크는 이메일 폼 뒤 같은 오류만 보이고 브라우저에 저장하지 않는다", async ({ page }) => {
  let openCalls = 0;
  await page.route("**/api/t/i/open", async (route) => {
    openCalls += 1;
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({ error: "invite_unavailable" }),
    });
  });

  const response = await page.goto(`/t/i/${token}`);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("heading", { name: "초대 링크 확인" })).toBeVisible();
  await expect(page.getByText("이 링크를 받은 이메일 주소를 입력하세요")).toBeVisible();

  const email = page.getByLabel("이메일 주소");
  await email.fill("first@example.com");
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(unavailable);

  await email.fill("second@example.com");
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(unavailable);
  expect(openCalls).toBe(2);

  expect(await page.evaluate(() => ({
    cookie: document.cookie,
    local: localStorage.length,
    session: sessionStorage.length,
  }))).toEqual({ cookie: "", local: 0, session: 0 });
});

