import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

for (const envFile of [".env", ".env.local"]) {
  if (existsSync(envFile)) loadEnvFile(envFile);
}

const DEPARTMENT_ID = "22222222-2222-4222-8222-222222222222";
const FIXED_NOTICE = "내 권한 범위 안의 부서 기록만 참고했습니다.";

type AnswerState = {
  id: string;
  status: "pending" | "done" | "refused" | "failed";
  answer: string | null;
  refused: boolean;
  citations: Array<{ quote: string }>;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function signInSeedUser(
  context: BrowserContext,
  baseURL: string,
  credentials: { emailEnv: string; passwordEnv: string },
): Promise<{ session: Session; supabase: SupabaseClient }> {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const unauthenticated = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const signIn = await unauthenticated.auth.signInWithPassword({
    email: requiredEnv(credentials.emailEnv),
    password: requiredEnv(credentials.passwordEnv),
  });
  if (signIn.error || !signIn.data.session) {
    throw signIn.error ?? new Error("seed user session was not created");
  }

  const session = signIn.data.session;
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  await context.addCookies([{
    name: `sb-${projectRef}-auth-token`,
    value: `base64-${base64Url(JSON.stringify(session))}`,
    url: new URL(baseURL).origin,
    httpOnly: true,
    secure: baseURL.startsWith("https://"),
    sameSite: "Lax",
  }]);

  return {
    session,
    supabase: createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    }),
  };
}

async function runWorker(page: Page, baseURL: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await page.request.post(`${baseURL}/api/jobs/run`, {
      headers: { "x-jobs-secret": requiredEnv("JOBS_TRIGGER_SECRET") },
    });
    expect(response.status()).toBe(200);
    await page.waitForTimeout(750);
  }
}

async function uploadEvidence(
  page: Page,
  baseURL: string,
  visibility: "dept" | "leads_only",
  filename: string,
  content: string,
): Promise<string> {
  const response = await page.request.post(`${baseURL}/api/d/${DEPARTMENT_ID}/documents`, {
    multipart: {
      visibility,
      title: filename,
      file: { name: filename, mimeType: "text/plain", buffer: Buffer.from(content, "utf8") },
    },
  });
  expect(response.status()).toBe(202);
  const body = (await response.json()) as { document_id?: string };
  expect(body.document_id).toBeTruthy();
  return body.document_id as string;
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
  const lead = await signInSeedUser(context, baseURL, {
    emailEnv: "SEED_LEAD_EMAIL", passwordEnv: "SEED_LEAD_PASSWORD",
  });
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await signInSeedUser(memberContext, baseURL, {
    emailEnv: "SEED_MEMBER_EMAIL", passwordEnv: "SEED_MEMBER_PASSWORD",
  });

  const departmentEvidence = `[합성 QA 테스트] 합성 QA-${token} 프로젝트 공개 일정은 10월 둘째 주입니다.`;
  const leadOnlyEvidence = `[합성 QA 테스트] 합성 QA-${token} 프로젝트 예산 상한은 4,200만원입니다(경영회의).`;
  const question = `합성 QA-${token} 프로젝트 예산 상한과 공개 일정은?`;
  let departmentSourceId = "";
  let leadOnlySourceId = "";

  try {
    [departmentSourceId, leadOnlySourceId] = await Promise.all([
      uploadEvidence(page, baseURL, "dept", `synthetic-qa-${token}-dept.txt`, departmentEvidence),
      uploadEvidence(page, baseURL, "leads_only", `synthetic-qa-${token}-lead.txt`, leadOnlyEvidence),
    ]);

    await runWorker(page, baseURL);
    await expect.poll(async () => {
      const result = await lead.supabase
        .from("items")
        .select("embed_status")
        .in("source_id", [departmentSourceId, leadOnlySourceId]);
      if (result.error) throw result.error;
      return (result.data ?? []).length === 2 && result.data.every((item) => item.embed_status === "done");
    }, { timeout: 90_000, intervals: [1_000, 2_000, 3_000] }).toBe(true);

    const leadAnswerId = await createAnswer(page, baseURL, question);
    await runWorker(page, baseURL);
    const leadAnswer = await waitForAnswer(page, baseURL, leadAnswerId);
    const memberAnswerId = await createAnswer(memberPage, baseURL, question);
    await runWorker(page, baseURL);
    const memberAnswer = await waitForAnswer(memberPage, baseURL, memberAnswerId);

    expect(leadAnswer.status).toBe("done");
    expect(leadAnswer.answer).toContain("4,200");
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
    for (const sourceId of [departmentSourceId, leadOnlySourceId]) {
      if (!sourceId) continue;
      // 문서도 기존 lead 소스 제거 경로로 정리한다. 원문·임베딩만 삭제되고 원장 인용은 보존된다.
      const removed = await page.request.delete(`${baseURL}/api/d/${DEPARTMENT_ID}/settings/source?id=${sourceId}`);
      expect(removed.status()).toBe(200);
    }
    await memberContext.close();
  }
});
