import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
test.skip(process.env.E2E_REVIEW_LIVE !== "1" || baseURL !== "http://localhost:3011" ||
  !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(supabaseUrl), "격리 로컬 QA 환경에서만 실행합니다.");

async function signIn(context: BrowserContext, email: string, password: string) {
  const client = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error || !result.data.session) throw result.error ?? new Error("local_login_failed");
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const encoded = Buffer.from(JSON.stringify(result.data.session), "utf8").toString("base64url");
  await context.addCookies([{ name: `sb-${projectRef}-auth-token`, value: `base64-${encoded}`, url: baseURL, httpOnly: true, secure: false, sameSite: "Lax" }]);
}

test("현재 권한으로 조건별 원문과 질문을 보고 선택 변경·비활성화·권한 회수 뒤에는 이전 결과를 숨긴다", async ({ browser, context, page }) => {
  test.setTimeout(120_000);
  const { dept, other, lead } = JSON.parse(readFileSync(".vercel/review-qa/ids.json", "utf8")) as { dept: string; other: string; lead: string };
  const { password } = JSON.parse(readFileSync(".vercel/review-qa/credentials.json", "utf8")) as { password: string };
  const service = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const sources = Array.from({ length: 4 }, () => randomUUID());
  const items = Array.from({ length: 4 }, () => randomUUID());
  const otherSource = randomUUID(), otherItem = randomUUID();
  const labels = ["고객 요청", "기존 견적", "변경 견적", "영업 원칙"];
  const contents = [
    "가격 확인 요청\n가격 재확인 요청\n할인 확인 요청\n부가세 확인 요청\n시작일을 알려주세요.",
    "기존 가격 1,000원\n계약은 자동 갱신되지 않습니다.",
    "변경 가격 1,500원\n할인은 승인되지 않았습니다. 예외는 팀장에게 확인합니다.",
    "할인은 승인 전 검토가 필요합니다.\n계약 해지는 담당자에게 확인합니다.",
  ];
  const selection = { request_item_id: items[0], old_quote_item_id: items[1], new_quote_item_id: items[2], policy_item_id: items[3] };
  const endpoint = `${baseURL}/api/d/${dept}/sales-review/checklist`;
  const count = async (table: string) => {
    const result = await service.from(table).select("id", { count: "exact", head: true });
    expect(result.error).toBeNull(); return result.count;
  };
  const tables = ["jobs", "llm_calls", "sales_review_tasks", "sales_review_actions"];
  const before = await Promise.all(tables.map(count));
  const membership = await service.from("members").select("role").eq("dept_id", dept).eq("user_id", lead).single();
  expect(membership.error).toBeNull();
  const inserted = await service.from("sources").insert([
    ...sources.map((id, i) => ({ id, dept_id: dept, kind: "document", external_id: `phase40-${id}`, title: `phase40 ${labels[i]}`, visibility: "leads_only", active: true, is_principles: i === 3 })),
    { id: otherSource, dept_id: other, kind: "document", external_id: `phase40-${otherSource}`, title: "타 부서 자료", visibility: "dept", active: true, is_principles: false },
  ]);
  expect(inserted.error).toBeNull();
  try {
    const insertedItems = await service.from("items").insert([
      ...items.map((id, i) => ({ id, dept_id: dept, source_id: sources[i], external_ref: `phase40-${id}`, content: contents[i] })),
      { id: otherItem, dept_id: other, source_id: otherSource, external_ref: `phase40-${otherItem}`, content: "다른 부서 가격" },
    ]);
    expect(insertedItems.error).toBeNull();
    await signIn(context, "review-lead@example.test", password);
    await page.goto(`${baseURL}/d/${dept}/sales-review`);
    await expect(page.getByRole("combobox", { name: "고객 요청" }).locator(`option[value="${items[0]}"]`)).toHaveCount(1, { timeout: 20_000 });
    for (let i = 0; i < 4; i++) await page.getByRole("combobox", { name: labels[i] }).selectOption(items[i]);
    await page.getByRole("button", { name: "원문 나란히 보기" }).click();
    const button = page.getByRole("button", { name: "조건 확인 질문 보기" });
    await button.click();
    const checklist = page.locator('[aria-label="영업 조건 확인 질문"]');
    const price = checklist.locator('[aria-label="가격 조건 확인"]');
    await expect(price).toContainText("가격·할인·부가세 조건");
    await expect(price).toContainText("고객 요청 · 관련 줄 전체 4건");
    await expect(price).toContainText("자료별 앞 3개 관련 줄만 표시했습니다.");
    await expect(price).toContainText(contents[2].split("\n")[1]);
    await expect(checklist.locator('[aria-label="계약 조건 확인"]')).toContainText("계약은 자동 갱신되지 않습니다.");
    const sourceHref = await price.getByRole("link", { name: "원문에서 확인" }).first().getAttribute("href");
    expect(sourceHref).toBe(`/d/${dept}/evidence/${items[0]}`);
    const original = await context.newPage();
    try { await original.goto(`${baseURL}${sourceHref}`); await expect(original.getByText("가격 확인 요청", { exact: false })).toBeVisible(); }
    finally { await original.close(); }
    await page.locator('[aria-labelledby="real-sales-sources-heading"]').screenshot({ path: "docs/verification/sales-review-condition-checklist-2026-10-01.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('[aria-labelledby="real-sales-sources-heading"]').screenshot({ path: "docs/verification/sales-review-condition-checklist-2026-10-01-mobile.png" });
    await page.setViewportSize({ width: 1280, height: 720 });

    // Changing an input must invalidate the displayed questions immediately.
    await page.getByRole("combobox", { name: "고객 요청" }).selectOption("");
    await expect(checklist).toHaveCount(0);
    await page.getByRole("combobox", { name: "고객 요청" }).selectOption(items[0]);
    await page.getByRole("button", { name: "원문 나란히 보기" }).click();
    await button.click(); await expect(checklist).toBeVisible();
    expect((await page.request.post(endpoint, { data: { ...selection, request_item_id: otherItem } })).status()).toBe(404);
    const member = await browser.newContext();
    try { await signIn(member, "review-member@example.test", password); expect((await member.request.post(endpoint, { data: selection })).status()).toBe(403); }
    finally { await member.close(); }

    const deactivate = await service.from("sources").update({ active: false }).eq("id", sources[3]);
    expect(deactivate.error).toBeNull();
    expect((await page.request.post(endpoint, { data: selection })).status()).toBe(404);
    await button.click();
    await expect(page.locator('[aria-labelledby="real-sales-sources-heading"] [role="alert"]')).toContainText("현재 확인할 수 없는 원문");
    await expect(checklist).toHaveCount(0);
    await expect(page.locator('[aria-label="선택한 원문 대조"]')).toHaveCount(0);
    expect((await service.from("sources").update({ active: true }).eq("id", sources[3])).error).toBeNull();
    await page.getByRole("button", { name: "원문 나란히 보기" }).click();
    await button.click(); await expect(checklist).toBeVisible();
    expect((await service.from("members").update({ role: "member" }).eq("dept_id", dept).eq("user_id", lead)).error).toBeNull();
    expect((await page.request.post(endpoint, { data: selection })).status()).toBe(403);
    await button.click();
    await expect(page.locator('[aria-labelledby="real-sales-sources-heading"] [role="alert"]')).toContainText("동의한 팀장만");
    await expect(checklist).toHaveCount(0);
  } finally {
    // Restore only the isolated QA member and remove only this test's synthetic records.
    await service.from("members").update({ role: membership.data!.role }).eq("dept_id", dept).eq("user_id", lead);
    await service.from("items").delete().in("id", [...items, otherItem]);
    await service.from("sources").delete().in("id", [...sources, otherSource]);
  }
  const after = await Promise.all(tables.map(count));
  expect(after).toEqual(before);
  writeFileSync("docs/verification/sales-review-condition-checklist-2026-10-01-runtime.json", JSON.stringify({
    environment: "isolated-local-synthetic", tables, before, after,
    checks: ["citations_and_links", "repeat_total_and_shown_limit", "selection_change_clears", "cross_department_404", "member_403", "inactive_source_404_and_clears", "revoked_lead_403_and_clears"],
  }, null, 2));
});

test("실제 데모 팀장과 미동의 팀장의 직접 요청은 원문 조회 전에 거절된다", async ({ browser }) => {
  test.setTimeout(60_000);
  const { dept } = JSON.parse(readFileSync(".vercel/review-qa/ids.json", "utf8")) as { dept: string };
  const { password } = JSON.parse(readFileSync(".vercel/review-qa/credentials.json", "utf8")) as { password: string };
  const service = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const demoDept = await service.from("departments").select("id,orgs!inner(is_demo)").eq("orgs.is_demo", true).limit(1).single();
  expect(demoDept.error).toBeNull();
  const email = `phase40-${randomUUID()}@example.test`;
  const user = await service.auth.admin.createUser({ email, password, email_confirm: true });
  expect(user.error).toBeNull();
  const userId = user.data.user!.id;
  const context = await browser.newContext();
  try {
    const insert = await service.from("members").insert([
      { user_id: userId, dept_id: demoDept.data!.id, role: "lead", display_name: "합성 데모 팀장", consented_at: new Date().toISOString() },
      { user_id: userId, dept_id: dept, role: "lead", display_name: "합성 미동의 팀장", consented_at: null },
    ]);
    expect(insert.error).toBeNull();
    await signIn(context, email, password);
    const selection = Object.fromEntries(["request_item_id", "old_quote_item_id", "new_quote_item_id", "policy_item_id"].map(key => [key, randomUUID()]));
    const results = [];
    for (const id of [demoDept.data!.id, dept]) {
      const response = await context.request.post(`${baseURL}/api/d/${id}/sales-review/checklist`, { data: selection });
      expect(response.status()).toBe(403);
      expect(response.headers()["cache-control"].split(",").map(value => value.trim())).toEqual(expect.arrayContaining(["private", "no-store"]));
      expect(await response.json()).not.toHaveProperty("topics");
      results.push({ scenario: id === dept ? "unconsented_lead" : "demo_lead", status: response.status(), cache_control: response.headers()["cache-control"] });
    }
    writeFileSync("docs/verification/sales-review-condition-checklist-2026-10-01-denied.json", JSON.stringify({ environment: "isolated-local-synthetic", results }, null, 2));
  } finally {
    await context.close();
    await service.from("members").delete().eq("user_id", userId);
    await service.auth.admin.deleteUser(userId);
  }
});
