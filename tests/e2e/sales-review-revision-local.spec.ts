import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
test.skip(
  process.env.E2E_REVIEW_LIVE !== "1" || baseURL !== "http://localhost:3011" ||
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(supabaseUrl),
  "격리 로컬 QA 환경에서만 실행합니다.",
);

type LocalIds = { org: string; lead: string; member: string };

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

async function waitUntilReady(page: Page, service: SupabaseClient, taskId: string, password: string) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const run = await page.request.post(`${baseURL}/api/jobs/run`, { headers: { "x-jobs-secret": password } });
    expect(run.status()).toBe(200);
    const read = await service.from("sales_review_tasks").select("status,status_reason").eq("id", taskId).single();
    expect(read.error).toBeNull();
    if (read.data?.status === "ready") return;
    if (read.data?.status === "failed") throw new Error(`sales_review_failed:${read.data.status_reason}`);
    await page.waitForTimeout(2_000);
  }
  throw new Error("sales_review_timeout");
}

test("돌려보낸 가상 검토를 연결해 다시 실행하고 별도 내부 확인을 남긴다", async ({ browser, context, page }) => {
  test.setTimeout(180_000);
  const ids = JSON.parse(readFileSync(".vercel/review-qa/ids.json", "utf8")) as LocalIds;
  const { password } = JSON.parse(readFileSync(".vercel/review-qa/credentials.json", "utf8")) as { password: string };
  const service = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const dept = randomUUID();
  const department = await service.from("departments").insert({ id: dept, org_id: ids.org, name: `가상 영업 재검토 QA ${dept.slice(0, 8)}` });
  expect(department.error).toBeNull();
  const membership = await service.from("members").insert([
    { user_id: ids.lead, dept_id: dept, role: "lead", display_name: "QA 팀장", consented_at: new Date().toISOString() },
    { user_id: ids.member, dept_id: dept, role: "member", display_name: "QA 담당자", consented_at: new Date().toISOString() },
  ]);
  expect(membership.error).toBeNull();
  const path = `/d/${dept}/sales-review`;
  await signIn(context, "review-member@example.test", password);
  await page.goto(`${baseURL}${path}`);
  const rootResponse = page.waitForResponse((response) => response.url().endsWith(`/api${path}`) && response.request().method() === "POST");
  await page.getByRole("button", { name: "가상 검토안 만들기" }).click();
  const rootPosted = await rootResponse;
  expect(rootPosted.status()).toBe(202);
  const { task_id: rootId } = await rootPosted.json() as { task_id: string };
  await waitUntilReady(page, service, rootId, password);

  const leadContext = await browser.newContext();
  try {
    await signIn(leadContext, "review-lead@example.test", password);
    const leadPage = await leadContext.newPage();
    await leadPage.goto(`${baseURL}${path}`);
    await leadPage.getByLabel("돌려보내는 이유").selectOption("schedule");
    await leadPage.getByRole("button", { name: "검토안 돌려보내기" }).click();
    await expect(leadPage.getByText("돌려보낸 작업 · 시작일 먼저 확인", { exact: false })).toBeVisible();

    await page.reload();
    await expect(page.getByText("견적 금액·시작일은 바뀌지 않습니다.", { exact: false })).toBeVisible();
    const revisionResponse = page.waitForResponse((response) => response.url().endsWith(`/api${path}/${rootId}/revision`) && response.request().method() === "POST");
    await page.getByRole("button", { name: "같은 자료로 다시 검토" }).click();
    const revisionPosted = await revisionResponse;
    expect(revisionPosted.status()).toBe(202);
    const { task_id: childId } = await revisionPosted.json() as { task_id: string };
    expect(childId).not.toBe(rootId);
    const child = await service.from("sales_review_tasks").select("focus,revision_of,case_version").eq("id", childId).single();
    expect(child.error).toBeNull();
    expect(child.data).toMatchObject({ focus: "schedule", revision_of: rootId, case_version: 1 });
    await waitUntilReady(page, service, childId, password);
    await expect(page.getByRole("button", { name: "이전 검토안 보기" })).toBeVisible();
    await expect(page.getByText("첫 12개월 견적 총액은 기존보다 6,000,000원 높습니다.")).toBeVisible();

    await leadPage.reload();
    await expect(leadPage.getByRole("button", { name: "내부 확인", exact: true })).toBeVisible();
    await leadPage.getByRole("button", { name: "내부 확인", exact: true }).click();
    await expect(leadPage.getByText("내부 확인 완료", { exact: false })).toBeVisible();
    const actions = await service.from("sales_review_actions").select("task_id,action,reason_code").in("task_id", [rootId, childId]);
    expect(actions.error).toBeNull();
    expect(actions.data).toHaveLength(2);
    expect(actions.data).toContainEqual(expect.objectContaining({ task_id: rootId, action: "reject", reason_code: "schedule" }));
    expect(actions.data).toContainEqual(expect.objectContaining({ task_id: childId, action: "approve", reason_code: null }));
    await leadPage.screenshot({ path: "docs/verification/sales-review-revision-2026-09-30.png", fullPage: true });
  } finally {
    await leadContext.close();
  }
});
