import { expect, test, type Page } from "@playwright/test";

const sales = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const development = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const hr = "11111111-1111-4111-8111-111111111119";
const hiddenChildTitle = "비밀 하위 페이지 제목";

async function openDemo(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/demo/notion");
  await expect(page.getByRole("heading", { name: "Notion 자동 수집", exact: true })).toBeVisible();
}

test.describe("notion collection UI", () => {
  test("조직 관리자는 최상위 2건만 두 부서에 매핑하고 동의 게이트 뒤 현황을 본다", async ({ page }) => {
    let topLevelCalls = 0;
    await page.route("**/api/admin/notion/top-level", async (route) => {
      topLevelCalls += 1;
      await route.fulfill({
        json: {
          results: [
            { id: "sales-root", title: "영업 운영 위키 (합성)", kind: "page" },
            { id: "dev-root", title: "개발 운영 위키 (합성)", kind: "page" },
          ],
        },
      });
    });
    await openDemo(page);

    const networkBody = await page.evaluate(async () =>
      (await fetch("/api/admin/notion/top-level")).text(),
    );
    expect(networkBody).not.toContain(hiddenChildTitle);
    expect(await page.content()).not.toContain(hiddenChildTitle);
    expect(topLevelCalls).toBe(1);

    await page.getByLabel("영업 운영 위키 (합성) 부서").selectOption(hr);
    await page.getByRole("button", { name: "수집 시작 체험" }).click();
    await expect(page.getByRole("status")).toContainText("동의하지 않은 멤버 1명이 있어 시작할 수 없습니다");
    await expect(page.getByLabel("합성 수집 진행 현황")).toHaveCount(0);

    await page.getByLabel("영업 운영 위키 (합성) 부서").selectOption(sales);
    await page.getByLabel("개발 운영 위키 (합성) 부서").selectOption(development);
    await page.getByRole("button", { name: "수집 시작 체험" }).click();
    const progress = page.getByLabel("합성 수집 진행 현황");
    await expect(progress).toContainText("영업팀 · 발견 5 · 완료 2 · 대기 1 · 실패 1 · 제외 1");
    await expect(progress).toContainText("개발팀 · 발견 4 · 완료 2 · 대기 1 · 실패 1 · 제외 0");
    await expect(progress).toContainText("미배정 2건 · 본문을 읽지 않았습니다.");
  });

  test("부서장은 문서를 제외하고 재발견 뒤에도 유지하며 일반 멤버 API는 403이다", async ({ page }) => {
    let mockedWrites = 0;
    await page.route("**/api/d/**/settings/notion", async (route) => {
      if (route.request().method() !== "GET") mockedWrites += 1;
      await route.fulfill({ status: 403, json: { error: "자동 수집 설정은 부서장만 변경할 수 있습니다." } });
    });
    await openDemo(page);

    const document = page.getByRole("article", { name: "가격·할인 승인 기준 자동 수집 문서" });
    await document.getByRole("button", { name: "제외", exact: true }).click();
    await expect(document.getByText("제외됨", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "재발견 체험" }).click();
    await expect(document.getByText("제외됨", { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "제외한 문서는 계속 제외 상태입니다" })).toBeVisible();

    await page.getByRole("button", { name: "일반 멤버 보기" }).click();
    await expect(page.getByRole("button", { name: "제외", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "부서장만으로", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다시 가져오기", exact: true })).toHaveCount(0);
    const status = await page.evaluate(async () => {
      const response = await fetch("/api/d/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/settings/notion", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "exclude", source_id: "source-1", subtree: true }),
      });
      return response.status;
    });
    expect(status).toBe(403);
    expect(mockedWrites).toBe(1);
  });

  test("데모 조작은 DB 쓰기·Notion·LLM 호출 없이 브라우저 상태에서 끝난다", async ({ page }) => {
    const externalCalls: string[] = [];
    const apiWrites: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (/api\.notion\.com|groq|openai|voyage/iu.test(url)) externalCalls.push(url);
      if (/\/api\//u.test(new URL(url).pathname) && !["GET", "HEAD", "OPTIONS"].includes(request.method())) apiWrites.push(url);
    });
    await openDemo(page);

    await page.getByLabel("영업 운영 위키 (합성) 부서").selectOption(sales);
    await page.getByLabel("개발 운영 위키 (합성) 부서").selectOption(development);
    await page.getByRole("button", { name: "수집 시작 체험" }).click();
    await page.getByRole("article", { name: "영업 원칙 문서 자동 수집 문서" }).getByRole("button", { name: "부서장만으로" }).click();
    await page.getByRole("article", { name: "가격·할인 승인 기준 자동 수집 문서" }).getByRole("button", { name: "다시 가져오기" }).click();
    await page.getByRole("button", { name: "연결 해제 체험" }).click();

    expect(apiWrites).toEqual([]);
    expect(externalCalls).toEqual([]);
  });

  for (const [label, width] of [["pc", 1440], ["mobile", 390]] as const) {
    test(`notion PC·390px 접근성 및 증빙 ${label}`, async ({ page }) => {
      await openDemo(page, width);
      await page.getByLabel("영업 운영 위키 (합성) 부서").selectOption(sales);
      await page.getByLabel("개발 운영 위키 (합성) 부서").selectOption(development);
      await page.getByRole("button", { name: "수집 시작 체험" }).click();
      await expect(page.locator("#demo-notion-admin")).toBeVisible();
      await page.locator("#demo-notion-admin").screenshot({ path: `docs/verification/notion-collection/step7-admin-${label}.png` });
      await page.locator("#demo-notion-department").screenshot({ path: `docs/verification/notion-collection/step7-s5-${label}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator("summary", { hasText: "자동 수집된 문서" })).toHaveAttribute("class", /cursor-pointer/u);
      await expect(page.getByText("수집 완료", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("확인 필요", { exact: true }).first()).toBeVisible();
    });
  }
});
