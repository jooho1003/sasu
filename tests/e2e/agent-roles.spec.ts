import { expect, test } from "@playwright/test";

const dept = process.env.E2E_LEAD_DEPT;
const leadStorageState = process.env.E2E_LEAD_STORAGE_STATE;
const memberStorageState = process.env.E2E_MEMBER_STORAGE_STATE;

test.describe("부서 역할", () => {
  test.skip(!dept || !leadStorageState || !memberStorageState, "인증된 lead/member E2E 시드와 storage state가 없어 E2E_LEAD_DEPT, E2E_LEAD_STORAGE_STATE, E2E_MEMBER_STORAGE_STATE가 설정된 환경에서만 실행합니다.");

  test("lead는 역할 화면의 고지와 생성 폼을 본다", async ({ browser }) => {
    const context = await browser.newContext({ storageState: leadStorageState });
    const page = await context.newPage();
    await page.goto(`/d/${dept}/roles`);
    await expect(page.getByText("AI 점수는 참고용입니다. 최종 판단은 담당자가 합니다.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "역할 만들기" })).toBeVisible();
    await context.close();
  });

  test("member에게는 역할 만들기 폼이 없다", async ({ browser }) => {
    const context = await browser.newContext({ storageState: memberStorageState });
    const member = await context.newPage();
    await member.goto(`/d/${dept}/roles`);
    await expect(member.getByRole("heading", { name: "역할 만들기" })).toHaveCount(0);
    await context.close();
  });
});
