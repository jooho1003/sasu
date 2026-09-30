import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { expect, test, type Page } from "@playwright/test";

import { SEED_LEAD, SEED_MEMBER, requiredEnv, signInSeedUser } from "./support/auth";

for (const envFile of [".env", ".env.local"]) {
  if (existsSync(envFile)) loadEnvFile(envFile);
}

const DEPARTMENT_ID = "22222222-2222-4222-8222-222222222222";
const FIXED_NOTICE = "내가 볼 수 있는 부서 기록만 보고 답했습니다.";

test.skip(
  process.env.E2E_ALLOW_SHOWCASE_WRITES !== "1",
  "공유 파일럿 부서 쓰기는 기본 차단됩니다. 전체 쓰기 검증은 scripts/review-qa.mjs의 격리 DB에서 실행하세요.",
);

type AnswerState = {
  id: string;
  status: "pending" | "done" | "refused" | "failed";
  answer: string | null;
  refused: boolean;
  citations: Array<{ quote: string }>;
};

async function kickWorker(page: Page, baseURL: string): Promise<void> {
  const response = await page.request.post(`${baseURL}/api/jobs/run`, {
    headers: { "x-jobs-secret": requiredEnv("JOBS_TRIGGER_SECRET") },
  });
  expect(response.status()).toBe(200);
}

async function runWorker(page: Page, baseURL: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await kickWorker(page, baseURL);
    await page.waitForTimeout(750);
  }
}

type Evidence = { reviewId: string; sourceId: string };

// 문서 업로드는 자료 검토함으로 들어간다(2026-09-16~). 추출 완료(ready)를 기다린 뒤
// 부서장이 확정해야 source·items가 생긴다.
async function publishEvidence(
  page: Page,
  baseURL: string,
  visibility: "dept" | "leads_only",
  filename: string,
  content: string,
): Promise<Evidence> {
  const response = await page.request.post(`${baseURL}/api/d/${DEPARTMENT_ID}/documents`, {
    multipart: {
      visibility,
      title: filename,
      file: { name: filename, mimeType: "text/plain", buffer: Buffer.from(content, "utf8") },
    },
  });
  expect(response.status()).toBe(202);
  const reviewId = ((await response.json()) as { review_id?: string }).review_id ?? "";
  expect(reviewId).toMatch(/^[0-9a-f-]{36}$/u);

  const reviewUrl = `${baseURL}/api/d/${DEPARTMENT_ID}/reviews/${reviewId}`;
  await expect.poll(async () => {
    const detail = await page.request.get(reviewUrl);
    expect(detail.status()).toBe(200);
    const status = ((await detail.json()) as { review?: { status?: string } }).review?.status;
    if (status !== "ready") await kickWorker(page, baseURL);
    return status;
  }, { timeout: 90_000, intervals: [1_000, 2_000, 3_000] }).toBe("ready");

  const published = await page.request.post(reviewUrl, { data: { action: "publish", revision: 1 } });
  expect(published.ok()).toBe(true);
  const sourceId = ((await published.json()) as { source_id?: string }).source_id ?? "";
  expect(sourceId).toMatch(/^[0-9a-f-]{36}$/u);
  return { reviewId, sourceId };
}

async function createAnswer(page: Page, baseURL: string, question: string): Promise<string> {
  const asked = await page.request.post(`${baseURL}/api/d/${DEPARTMENT_ID}/ask`, {
    data: { question },
  });
  expect(asked.status()).toBe(202);
  const askBody = (await asked.json()) as { answer_id?: string };
  expect(askBody.answer_id).toBeTruthy();
  return askBody.answer_id as string;
}

async function waitForAnswer(page: Page, baseURL: string, answerId: string): Promise<AnswerState> {
  let answer: AnswerState | null = null;
  await expect.poll(async () => {
    const response = await page.request.get(`${baseURL}/api/d/${DEPARTMENT_ID}/answers/${answerId}`);
    expect(response.status()).toBe(200);
    const next = (await response.json()) as AnswerState;
    answer = next;
    if (next.status === "pending") await kickWorker(page, baseURL);
    return next.status;
  }, { timeout: 90_000, intervals: [1_000, 2_000, 3_000] }).not.toBe("pending");
  if (!answer) throw new Error("answer was not returned");
  return answer;
}

test.setTimeout(180_000);

test("lead와 member의 ASK는 leads_only 근거를 다르게 반환한다", async ({ browser, context, page }) => {
  test.skip(process.env.E2E_ALLOW_EXTERNAL_WRITES !== "1", "실제 DB 쓰기·임베딩·LLM을 포함하므로 승인된 테스트 환경에서 E2E_ALLOW_EXTERNAL_WRITES=1로 실행합니다.");
  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const token = crypto.randomUUID().slice(0, 8).toUpperCase();
  const lead = await signInSeedUser(context, baseURL, SEED_LEAD);
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await signInSeedUser(memberContext, baseURL, SEED_MEMBER);

  const departmentEvidence = `[합성 QA 테스트] 합성 QA-${token} 프로젝트 공개 일정은 10월 둘째 주입니다.`;
  const leadOnlyEvidence = `[합성 QA 테스트] 합성 QA-${token} 프로젝트 예산 상한은 4,200만원입니다(경영회의).`;
  const question = `합성 QA-${token} 프로젝트 예산 상한과 공개 일정은?`;
  const evidence: Evidence[] = [];

  try {
    const published = await Promise.allSettled([
      publishEvidence(page, baseURL, "dept", `synthetic-qa-${token}-dept.txt`, departmentEvidence),
      publishEvidence(page, baseURL, "leads_only", `synthetic-qa-${token}-lead.txt`, leadOnlyEvidence),
    ]);
    for (const result of published) if (result.status === "fulfilled") evidence.push(result.value);
    for (const result of published) if (result.status === "rejected") throw result.reason;

    await runWorker(page, baseURL);
    await expect.poll(async () => {
      const result = await lead.supabase
        .from("items")
        .select("embed_status")
        .in("source_id", evidence.map((entry) => entry.sourceId));
      if (result.error) throw result.error;
      const embedded = (result.data ?? []).length === 2 && result.data.every((item) => item.embed_status === "done");
      // 분류 뒤에 예약되는 embed 작업은 위 runWorker 이후에 생길 수 있다. 매분 cron이 없는 로컬 QA에서도 끝나게 깨운다.
      if (!embedded) await kickWorker(page, baseURL);
      return embedded;
    }, { timeout: 90_000, intervals: [1_000, 2_000, 3_000] }).toBe(true);

    const leadAnswerId = await createAnswer(page, baseURL, question);
    await runWorker(page, baseURL);
    const leadAnswer = await waitForAnswer(page, baseURL, leadAnswerId);
    const memberAnswerId = await createAnswer(memberPage, baseURL, question);
    await runWorker(page, baseURL);
    const memberAnswer = await waitForAnswer(memberPage, baseURL, memberAnswerId);

    expect(leadAnswer.status).toBe("done");
    // 답변 본문은 고정 안내 문장이고 근거 원문은 인용 카드에만 나온다(PRD §6-5 5항, phase 32).
    expect(leadAnswer.citations.some((citation) => citation.quote.includes("4,200"))).toBe(true);
    expect(memberAnswer.answer ?? "").not.toContain("4,200");
    expect(memberAnswer.citations.some((citation) => citation.quote.includes("4,200"))).toBe(false);
    expect(JSON.stringify(memberAnswer)).not.toContain("excluded");
    expect(JSON.stringify(memberAnswer)).not.toContain("제외");

    await memberPage.goto(`${baseURL}/d/${DEPARTMENT_ID}/ask`, { waitUntil: "networkidle" });
    let submitted = false;
    await expect(async () => {
      if (!submitted) {
        await memberPage.getByRole("textbox", { name: "무엇이 궁금한가요?" }).fill(question);
        await memberPage.getByRole("button", { name: "묻기", exact: true }).click();
        submitted = true;
      }
      await runWorker(memberPage, baseURL);
      await expect(memberPage.getByText(FIXED_NOTICE, { exact: true })).toBeVisible();
      await expect(memberPage.locator("article")).not.toContainText("4,200");
    }).toPass({ timeout: 90_000 });
  } finally {
    for (const { reviewId, sourceId } of evidence) {
      // 확정한 문서도 기존 lead 소스 제거 경로로 정리한다. 원문·임베딩만 삭제되고 원장 인용은 보존된다.
      const removed = await page.request.delete(`${baseURL}/api/d/${DEPARTMENT_ID}/settings/source?id=${sourceId}`);
      expect(removed.status()).toBe(200);
      const deleted = await page.request.post(`${baseURL}/api/d/${DEPARTMENT_ID}/reviews/${reviewId}`, {
        data: { action: "delete", revision: 1 },
      });
      if (!deleted.ok()) console.warn(`cleanup: review=${reviewId} status=${deleted.status()}`);
    }
    await memberContext.close();
  }
});
