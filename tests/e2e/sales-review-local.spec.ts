import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

test.skip(
  process.env.E2E_REVIEW_LIVE !== "1" || baseURL !== "http://localhost:3011" ||
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(supabaseUrl),
  "격리 로컬 QA 환경에서만 실행합니다.",
);

type LocalIds = { dept: string };

async function signIn(context: BrowserContext, email: string, password: string) {
  const client = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error || !result.data.session) throw result.error ?? new Error("local_login_failed");
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const encoded = Buffer.from(JSON.stringify(result.data.session), "utf8").toString("base64url");
  await context.addCookies([{
    name: `sb-${projectRef}-auth-token`, value: `base64-${encoded}`,
    url: baseURL, httpOnly: true, secure: false, sameSite: "Lax",
  }]);
}

test("가상 영업 검토 생성부터 근거 결과와 팀장 내부 확인까지", async ({ browser, context, page }) => {
  test.setTimeout(180_000);
  const { dept } = JSON.parse(readFileSync(".vercel/review-qa/ids.json", "utf8")) as LocalIds;
  const { password } = JSON.parse(readFileSync(".vercel/review-qa/credentials.json", "utf8")) as { password: string };
  const path = `/d/${dept}/sales-review`;
  await signIn(context, "review-lead@example.test", password);
  await page.goto(`${baseURL}${path}`);
  await expect(page.getByRole("heading", { name: "견적 변경 검토" })).toBeVisible();
  await expect(page.getByText("가상 사례입니다. 고객에게 발송되지 않으며 실제 가격·계약 승인이 아닙니다.")).toBeVisible();
  await expect(page.locator("#sales-source-S4")).toContainText("영업팀장");

  const posted = page.waitForResponse((response) => response.url().endsWith(`${path.replace("/d/", "/api/d/")}`) && response.request().method() === "POST");
  await page.getByRole("button", { name: "가상 검토안 만들기" }).click();
  const response = await posted;
  expect(response.status()).toBe(202);
  const { task_id: taskId } = await response.json() as { task_id: string };
  await expect(page.getByRole("button", { name: /전체 · .* · 검토 준비/ }).first()).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });

  const service = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const jobs = await service.from("jobs").select("id").eq("kind", "run_sales_review").contains("payload", { taskId });
  expect(jobs.error).toBeNull();
  expect(jobs.data).toHaveLength(1);

  let status = "queued";
  let reason: string | null = null;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const run = await page.request.post(`${baseURL}/api/jobs/run`, { headers: { "x-jobs-secret": password } });
    expect(run.status()).toBe(200);
    const task = await service.from("sales_review_tasks").select("status,status_reason").eq("id", taskId).single();
    expect(task.error).toBeNull();
    status = task.data!.status;
    reason = task.data!.status_reason;
    if (status === "ready" || status === "failed") break;
    await page.waitForTimeout(2_000);
  }
  expect(status, reason ?? "worker did not complete").toBe("ready");
  await expect(page.getByText("첫 12개월 견적 총액은 기존보다 6,000,000원 높습니다.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "고객 회신 초안 · 발송 안 됨" })).toBeVisible();
  await expect(page.locator("a[href='#sales-source-S2']").first()).toBeVisible();

  const member = await browser.newContext();
  try {
    await signIn(member, "review-member@example.test", password);
    const memberPage = await member.newPage();
    await memberPage.goto(`${baseURL}${path}`);
    await expect(memberPage.getByText("첫 12개월 견적 총액은 기존보다 6,000,000원 높습니다.")).toBeVisible();
    await expect(memberPage.getByRole("button", { name: "내부 확인", exact: true })).toHaveCount(0);
    const denied = await memberPage.request.post(`${baseURL}/api/d/${dept}/sales-review/${taskId}/review`, { data: { action: "approve" } });
    expect(denied.status()).toBe(403);
  } finally {
    await member.close();
  }

  await page.getByRole("button", { name: "내부 확인", exact: true }).click();
  await expect(page.getByText("내부 확인 완료", { exact: false })).toBeVisible();
  const duplicate = await page.request.post(`${baseURL}/api/d/${dept}/sales-review/${taskId}/review`, { data: { action: "approve" } });
  expect(duplicate.status()).toBe(409);
  const actions = await service.from("sales_review_actions").select("id,action").eq("task_id", taskId);
  expect(actions.error).toBeNull();
  expect(actions.data).toHaveLength(1);
  expect(actions.data?.[0].action).toBe("approve");
  await page.screenshot({ path: "docs/verification/sales-agent-review-2026-09-30.png", fullPage: true });
});
