import { randomUUID } from "node:crypto";
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

test("팀장이 실제 견적 문구 차이를 원문으로 확인하고 권한 변경 뒤에는 거절된다", async ({ browser, context, page }) => {
  test.setTimeout(90_000);
  const { dept, other } = JSON.parse(readFileSync(".vercel/review-qa/ids.json", "utf8")) as { dept: string; other: string };
  const { password } = JSON.parse(readFileSync(".vercel/review-qa/credentials.json", "utf8")) as { password: string };
  const service = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const sourceIds = Array.from({ length: 4 }, () => randomUUID());
  const itemIds = Array.from({ length: 4 }, () => randomUUID());
  const otherSourceId = randomUUID();
  const otherItemId = randomUUID();
  const labels = ["고객 요청", "기존 견적", "변경 견적", "영업 원칙"];
  const contents = [
    "고객은 조건 재검토를 요청했습니다.",
    "공통 조건\n기존만 있는 문구\n반복 조건\n반복 조건",
    "공통 조건\n변경에 추가된 문구\n반복 조건",
    "대외 견적은 팀장 확인이 필요합니다.",
  ];
  const sourceRows = sourceIds.map((id, i) => ({ id, dept_id: dept, kind: "document", external_id: `phase39-${id}`, title: `phase39 ${labels[i]}`, visibility: "leads_only", is_principles: i === 3, active: true }));
  const itemRows = itemIds.map((id, i) => ({ id, source_id: sourceIds[i], dept_id: dept, external_ref: `phase39-${id}`, content: contents[i] }));
  const selection = { request_item_id: itemIds[0], old_quote_item_id: itemIds[1], new_quote_item_id: itemIds[2], policy_item_id: itemIds[3] };
  const compareURL = `${baseURL}/api/d/${dept}/sales-review/compare`;
  const count = async (table: string) => {
    const result = await service.from(table).select("id", { count: "exact", head: true });
    expect(result.error).toBeNull();
    return result.count;
  };
  const before = {
    jobs: await count("jobs"), llm: await count("llm_calls"),
    tasks: await count("sales_review_tasks"), actions: await count("sales_review_actions"),
  };
  const inserted = await service.from("sources").insert([...sourceRows, { id: otherSourceId, dept_id: other, kind: "document", external_id: `phase39-${otherSourceId}`, title: "타 부서", visibility: "dept", is_principles: false, active: true }]);
  expect(inserted.error).toBeNull();
  try {
    const itemInsert = await service.from("items").insert([...itemRows, { id: otherItemId, source_id: otherSourceId, dept_id: other, external_ref: `phase39-${otherItemId}`, content: "타 부서 원문" }]);
    expect(itemInsert.error).toBeNull();
    await signIn(context, "review-lead@example.test", password);
    await page.goto(`${baseURL}/d/${dept}/sales-review`);
    await expect(page.getByRole("combobox", { name: "고객 요청" }).locator(`option[value="${itemIds[0]}"]`)).toHaveCount(1, { timeout: 15_000 });
    for (let i = 0; i < 4; i++) await page.getByRole("combobox", { name: labels[i] }).selectOption(itemIds[i]);
    await page.getByRole("button", { name: "원문 나란히 보기" }).click();
    await expect(page.getByRole("button", { name: "견적 문구 차이 보기" })).toBeVisible();
    await page.getByRole("button", { name: "견적 문구 차이 보기" }).click();
    const comparison = page.locator('[aria-label="견적 원문 문구 차이"]');
    await expect(comparison).toContainText("기존만 있는 문구");
    await expect(comparison).toContainText("변경에 추가된 문구");
    await expect(comparison).toContainText("기존 견적에서 더 많이 나온 문구 · 전체 2건");
    const oldHref = await comparison.getByRole("link", { name: "원문에서 확인" }).first().getAttribute("href");
    expect(oldHref).toBe(`/d/${dept}/evidence/${itemIds[1]}`);
    const originalPage = await context.newPage();
    try {
      await originalPage.goto(`${baseURL}${oldHref}`);
      await expect(originalPage.getByText("기존만 있는 문구", { exact: false })).toBeVisible();
    } finally { await originalPage.close(); }
    await page.screenshot({ path: "docs/verification/sales-review-literal-comparison-2026-09-30.png", fullPage: true });

    const crossDept = await page.request.post(compareURL, { data: { ...selection, request_item_id: otherItemId } });
    expect(crossDept.status()).toBe(404);
    const member = await browser.newContext();
    try {
      await signIn(member, "review-member@example.test", password);
      expect((await member.request.post(compareURL, { data: selection })).status()).toBe(403);
    } finally { await member.close(); }

    const deleted = await service.from("items").update({ deleted_at: new Date().toISOString() }).eq("id", itemIds[2]);
    expect(deleted.error).toBeNull();
    expect((await page.request.post(compareURL, { data: selection })).status()).toBe(404);
    await page.getByRole("button", { name: "견적 문구 차이 보기" }).click();
    await expect(page.locator('[aria-labelledby="real-sales-sources-heading"] [role="alert"]')).toContainText("현재 확인할 수 없는 원문");
    await expect(comparison).toHaveCount(0);
    expect(await count("jobs")).toBe(before.jobs);
    expect(await count("llm_calls")).toBe(before.llm);
    expect(await count("sales_review_tasks")).toBe(before.tasks);
    expect(await count("sales_review_actions")).toBe(before.actions);
  } finally {
    await service.from("items").delete().in("id", [...itemIds, otherItemId]);
    await service.from("sources").delete().in("id", [...sourceIds, otherSourceId]);
  }
});
