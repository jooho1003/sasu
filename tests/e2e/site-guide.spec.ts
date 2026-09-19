import { expect, test } from "@playwright/test";

// 서버의 SASU_GUIDE_URL과 동일하게 설정한다. 외부 페이지 자체는 별도 공개 접근 검증 대상이다.
const guideUrl = process.env.E2E_GUIDE_URL;

test.describe("홈페이지 노션 가이드 동선", () => {
  test.skip(!guideUrl, "SASU_GUIDE_URL이 설정된 테스트 서버와 E2E_GUIDE_URL 필요");

  for (const width of [390, 768, 1440]) {
    test(`${width}px에서 가이드를 찾고 새 탭으로 연다`, async ({ page, context }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      if (width < 768) await page.getByText("메뉴 열기", { exact: true }).click();
      const menu = page.getByRole("navigation", { name: width < 768 ? "모바일 메뉴" : "주요 메뉴", exact: true });
      await expect(menu.getByRole("link", { name: "사용 가이드", exact: false })).toBeVisible();
      await expect(menu.getByRole("link", { name: "사용 가이드", exact: false })).toHaveAttribute("href", guideUrl!);
      if (width < 768) await page.getByText("메뉴 닫기", { exact: true }).click();
      const link = page.getByRole("link", { name: "노션 가이드 보기", exact: false });
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      // 앱 링크 동작만 검사한다. 노션 API·로그인·외부 네트워크는 사용하지 않는다.
      await context.route(guideUrl!, (route) => route.fulfill({ contentType: "text/html", body: "<h1>가이드 연결 확인</h1>" }));
      const popupPromise = page.waitForEvent("popup");
      await link.click();
      const popup = await popupPromise;
      await expect(popup).toHaveURL(guideUrl!);
      await popup.close();
      const footer = page.getByRole("navigation", { name: "하단 메뉴" });
      await expect(footer.getByRole("link", { name: "사용 가이드", exact: false })).toHaveAttribute("href", guideUrl!);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
});
