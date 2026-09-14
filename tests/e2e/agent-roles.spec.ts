import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

for (const envFile of [".env", ".env.local"]) {
  if (existsSync(envFile)) loadEnvFile(envFile);
}

// ask-permission.spec.ts와 같은 QA 부서·시드 계정. 합성 문서만 쓰고 끝나면 소스 제거·역할 보관으로 정리한다.
const DEPARTMENT_ID = "22222222-2222-4222-8222-222222222222";
const NOTICE = "AI 점수는 참고용입니다. 최종 판단은 담당자가 합니다.";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function signIn(context: BrowserContext, baseURL: string, emailEnv: string, passwordEnv: string): Promise<void> {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const client = createClient(supabaseUrl, requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const result = await client.auth.signInWithPassword({ email: requiredEnv(emailEnv), password: requiredEnv(passwordEnv) });
  if (result.error || !result.data.session) throw result.error ?? new Error("seed user session was not created");
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const encoded = Buffer.from(JSON.stringify(result.data.session), "utf8").toString("base64url");
  await context.addCookies([{
    name: `sb-${projectRef}-auth-token`,
    value: `base64-${encoded}`,
    url: new URL(baseURL).origin,
    httpOnly: true,
    secure: baseURL.startsWith("https://"),
    sameSite: "Lax",
  }]);
}

async function runWorker(page: Page, baseURL: string, rounds = 6): Promise<void> {
  for (let attempt = 0; attempt < rounds; attempt += 1) {
    const response = await page.request.post(`${baseURL}/api/jobs/run`, {
      headers: { "x-jobs-secret": requiredEnv("JOBS_TRIGGER_SECRET") },
    });
    expect(response.status()).toBe(200);
    await page.waitForTimeout(1_000);
  }
}

test("lead는 역할을 만들어 합성 문서에 적용하고 인용된 점수표를 받는다, member는 만들 수 없다", async ({ browser, context, page }) => {
  test.setTimeout(6 * 60_000);
  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const token = Date.now().toString(36);
  await signIn(context, baseURL, "SEED_LEAD_EMAIL", "SEED_LEAD_PASSWORD");
  const memberContext = await browser.newContext();
  await signIn(memberContext, baseURL, "SEED_MEMBER_EMAIL", "SEED_MEMBER_PASSWORD");
  const memberPage = await memberContext.newPage();

  let sourceId: string | null = null;
  let roleId: string | null = null;
  try {
    const content = [
      `합성 QA 지원서 ${token}`,
      "Next.js App Router와 Supabase RLS로 사내 승인 도구를 직접 설계하고 운영했습니다.",
      "결정 이유를 문서로 남기고 팀 리뷰에서 변경 사유를 설명하는 습관이 있습니다.",
    ].join("\n");
    const upload = await page.request.post(`${baseURL}/api/d/${DEPARTMENT_ID}/documents`, {
      multipart: {
        visibility: "leads_only",
        title: `synthetic-role-qa-${token}.txt`,
        file: { name: `synthetic-role-qa-${token}.txt`, mimeType: "text/plain", buffer: Buffer.from(content, "utf8") },
      },
    });
    expect(upload.status()).toBe(202);
    sourceId = ((await upload.json()) as { document_id: string }).document_id;
    await runWorker(page, baseURL);

    const created = await page.request.post(`${baseURL}/api/d/${DEPARTMENT_ID}/roles`, {
      data: {
        name: `QA 서류 검토 ${token}`,
        instruction: "합성 QA용 역할입니다. 프로젝트 스택 활용과 문서화 습관을 봅니다.",
        visibility: "leads_only",
        criteria: [
          { key: "stack", label: "스택 활용", description: "Next.js·Supabase 실무 근거", weight: 3 },
          { key: "docs", label: "문서화", description: "결정 이유를 기록한 근거", weight: 2 },
        ],
      },
    });
    expect(created.status()).toBe(201);
    roleId = ((await created.json()) as { role: { id: string } }).role.id;

    const memberCreate = await memberPage.request.post(`${baseURL}/api/d/${DEPARTMENT_ID}/roles`, {
      data: { name: "forged", instruction: "forged", visibility: "dept", criteria: [{ key: "x", label: "x", description: "x", weight: 1 }] },
    });
    expect(memberCreate.status()).toBe(403);

    const run = await page.request.post(`${baseURL}/api/d/${DEPARTMENT_ID}/roles/${roleId}/runs`, { data: { source_ids: [sourceId] } });
    expect(run.status()).toBe(202);

    type Row = { status: string; weighted_score: number | null; result: { criteria: Array<{ evidence: string; citations: Array<{ quote: string }> }> } | null };
    let row: Row | undefined;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await runWorker(page, baseURL, 2);
      const results = await page.request.get(`${baseURL}/api/d/${DEPARTMENT_ID}/roles/${roleId}/runs`);
      expect(results.status()).toBe(200);
      row = ((await results.json()) as { results: Row[] }).results[0];
      if (row && row.status !== "processing") break;
    }
    expect(row?.status).toBe("completed");
    expect(row?.weighted_score).not.toBeNull();
    const okCriteria = row?.result?.criteria.filter((criterion) => criterion.evidence === "ok") ?? [];
    expect(okCriteria.length).toBeGreaterThan(0);
    for (const criterion of okCriteria) {
      expect(criterion.citations.length).toBeGreaterThan(0);
      for (const citation of criterion.citations) expect(content).toContain(citation.quote);
    }
    expect(JSON.stringify(row?.result)).not.toMatch(/"(pass|fail|hire|recommend)"/);

    const memberResults = await memberPage.request.get(`${baseURL}/api/d/${DEPARTMENT_ID}/roles/${roleId}/runs`);
    expect(((await memberResults.json()) as { results: unknown[] }).results).toHaveLength(0);

    await page.goto(`${baseURL}/d/${DEPARTMENT_ID}/roles`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "역할 만들기" })).toBeVisible();
    await memberPage.goto(`${baseURL}/d/${DEPARTMENT_ID}/roles`, { waitUntil: "networkidle" });
    await expect(memberPage.getByRole("heading", { name: "역할 만들기" })).toHaveCount(0);
    await page.getByRole("button", { name: new RegExp(`QA 서류 검토 ${token}`) }).first().click().catch(() => undefined);
    await expect(page.getByText(NOTICE).first()).toBeVisible();
  } finally {
    if (sourceId) {
      const removed = await page.request.delete(`${baseURL}/api/d/${DEPARTMENT_ID}/settings/source?id=${sourceId}`);
      expect(removed.status()).toBe(200);
    }
    if (roleId) {
      const archived = await page.request.patch(`${baseURL}/api/d/${DEPARTMENT_ID}/roles/${roleId}`, { data: { archived: true } });
      expect(archived.status()).toBe(200);
    }
    await memberContext.close();
  }
});
