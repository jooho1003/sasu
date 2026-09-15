import { expect, test } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { missingEnv, SEED_LEAD, signInSeedUser } from "./support/auth";

loadEnvConfig(process.cwd());
const dept = "22222222-2222-4222-8222-222222222222";
const answerId = "11111111-1111-4111-8111-111111111111";
test.beforeEach(async ({ context, baseURL }) => {
  test.skip(missingEnv(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SEED_LEAD_EMAIL", "SEED_LEAD_PASSWORD"]).length > 0, "QA 로그인 환경 필요");
  await signInSeedUser(context, baseURL!, SEED_LEAD);
});
for (const width of [1440, 390]) {
  test(`내 Slack 질문 조회·저장 답변 확인·재전송 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let gets = 0, retries = 0, asks = 0;
    await page.route(`**/api/d/${dept}/ask`, route => { asks++; return route.fulfill({ status: 500, json: {} }); });
    await page.route(`**/api/d/${dept}/slack-questions`, route => {
      if (route.request().method() === "POST") {
        retries++;
        expect(route.request().postDataJSON()).toEqual({ answerId });
        return route.fulfill({ status: 202, json: { ok: true } });
      }
      gets++;
      return route.fulfill({ json: { questions: [{ id: answerId, question: "합성 QA — 오늘 배포할까요?", status: "done", delivery_state: retries ? "pending" : "failed" }] } });
    });
    await page.route(`**/api/d/${dept}/answers/${answerId}`, route => route.fulfill({ json: {
      id: answerId, status: "done", answer: "검증 후 배포합니다.", refused: false,
      citations: [{ quote: "검증 후 배포합니다.", author: "합성 담당자", source: "배포 원칙", href: "#" }],
    } }));
    await page.goto(`/d/${dept}/ask`);
    const panel = page.getByRole("region", { name: "내 Slack 질문" });
    await expect(panel.getByRole("button", { name: "최근 질문 확인" })).toBeVisible();
    expect(gets).toBe(0);
    await panel.getByRole("button", { name: "최근 질문 확인" }).click();
    await expect(panel.getByText("전송 재시도 필요")).toBeVisible();
    await panel.getByRole("button", { name: "답변 보기" }).click();
    await expect(page.locator("article")).toContainText("검증 후 배포합니다.");
    await panel.getByRole("button", { name: "Slack에 다시 보내기" }).click();
    await expect(panel.getByRole("status")).toContainText("다시 보내고 있습니다");
    await expect(panel.getByRole("button", { name: "Slack에 다시 보내기" })).toHaveCount(0);
    expect(retries).toBe(1); expect(asks).toBe(0); expect(gets).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/verification/slack-completion-2026-09-16/fixture-slack-questions-${width}.png`, fullPage: true });
  });
}
test("조회 실패 재시도와 인용 없는 생성 본문 차단", async ({ page }) => {
  let gets = 0;
  await page.route(`**/api/d/${dept}/slack-questions`, route => {
    gets++;
    return gets === 1 ? route.fulfill({ status: 503, json: { error: "잠시 후 다시 확인해 주세요." } })
      : route.fulfill({ json: { questions: [{ id: answerId, question: "합성 QA 질문", status: "done", delivery_state: "sent" }] } });
  });
  await page.route(`**/api/d/${dept}/answers/${answerId}`, route => route.fulfill({ json: { id: answerId, status: "done", answer: "노출하면 안 되는 본문", citations: [], refused: false } }));
  await page.goto(`/d/${dept}/ask`);
  await page.getByRole("button", { name: "최근 질문 확인" }).click();
  await expect(page.getByRole("region", { name: "내 Slack 질문" }).getByRole("alert")).toContainText("잠시 후");
  await page.getByRole("button", { name: "최근 질문 확인" }).click();
  await page.getByRole("button", { name: "답변 보기" }).click();
  await expect(page.getByText("노출하면 안 되는 본문")).toHaveCount(0);
});

test("2분 넘게 pending인 답변은 대기를 종료하고 다시 질문할 수 있다", async ({ page }) => {
  await page.route(`**/api/d/${dept}/ask`, route => route.fulfill({ status: 202, json: { answer_id: answerId } }));
  await page.route(`**/api/d/${dept}/answers/${answerId}`, route => route.fulfill({ json: { id: answerId, status: "pending", answer: null, citations: [], refused: false } }));
  await page.goto(`/d/${dept}/ask`);
  await page.clock.install();
  await page.getByLabel("무엇이 궁금한가요?").fill("합성 QA — 언제 배포할까요?");
  await page.getByRole("button", { name: "묻기", exact: true }).click();
  await expect(page.getByText("부서 기록을 확인하고 있습니다.")).toBeVisible();
  await page.clock.fastForward(121_000);
  await expect(page.getByText("답변 확인이 지연되고 있습니다. 잠시 후 다시 질문해 주세요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "묻기", exact: true })).toBeEnabled();
});
