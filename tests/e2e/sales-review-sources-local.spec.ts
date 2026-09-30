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

test("부서장이 현재 원문 네 건을 연결하고 삭제 뒤 재조회가 거절된다", async ({ browser, context, page }) => {
  test.setTimeout(90_000);
  const { dept, other } = JSON.parse(readFileSync(".vercel/review-qa/ids.json", "utf8")) as { dept: string; other: string };
  const { password } = JSON.parse(readFileSync(".vercel/review-qa/credentials.json", "utf8")) as { password: string };
  const service = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const sourceIds = Array.from({ length: 4 }, () => randomUUID());
  const itemIds = Array.from({ length: 4 }, () => randomUUID());
  const otherSourceId = randomUUID();
  const otherItemId = randomUUID();
  const labels = ["고객 요청", "기존 견적", "변경 견적", "영업 원칙"];
  const sourceRows = sourceIds.map((id, i) => ({ id, dept_id: dept, kind: "document", external_id: `phase38-${id}`, title: `phase38 ${labels[i]}`, visibility: "leads_only", is_principles: i === 3, active: true }));
  const itemRows = itemIds.map((id, i) => ({ id, source_id: sourceIds[i], dept_id: dept, external_ref: `phase38-${id}`, content: `phase38 ${labels[i]} 원문 ${i + 1}입니다.` }));
  const sourceInsert = await service.from("sources").insert([...sourceRows, { id: otherSourceId, dept_id: other, kind: "document", external_id: `phase38-${otherSourceId}`, title: "다른 부서 자료", visibility: "dept", is_principles: false, active: true }]);
  expect(sourceInsert.error).toBeNull();
  try {
    const itemInsert = await service.from("items").insert([...itemRows, { id: otherItemId, source_id: otherSourceId, dept_id: other, external_ref: `phase38-${otherItemId}`, content: "다른 부서 원문입니다." }]);
    expect(itemInsert.error).toBeNull();
    const stored = await service.from("items").select("id", { count: "exact" }).in("id", itemIds);
    expect(stored.error).toBeNull();
    expect(stored.data).toHaveLength(4);
    await signIn(context, "review-lead@example.test", password);
    const candidatesResponse = await page.request.get(`${baseURL}/api/d/${dept}/sales-review/sources`);
    expect(candidatesResponse.status()).toBe(200);
    const candidatesBody = await candidatesResponse.json() as { candidates: { item_id: string }[] };
    expect(itemIds.map((id) => candidatesBody.candidates.some((candidate) => candidate.item_id === id))).toEqual([true, true, true, true]);
    const loadedSources = page.waitForResponse((response) => response.url().endsWith(`/api/d/${dept}/sales-review/sources`) && response.request().method() === "GET");
    await page.goto(`${baseURL}/d/${dept}/sales-review`);
    const loaded = await loadedSources;
    const loadedBody = await loaded.json() as { candidates: { item_id: string }[] };
    expect(itemIds.map((id) => loadedBody.candidates.some((candidate) => candidate.item_id === id))).toEqual([true, true, true, true]);
    await expect(page.getByRole("heading", { name: "검토할 원문 연결" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "고객 요청" }).locator(`option[value="${itemIds[0]}"]`)).toHaveCount(1, { timeout: 15_000 });
    await page.getByRole("combobox", { name: "고객 요청" }).selectOption(itemIds[0]);
    await page.getByRole("combobox", { name: "기존 견적" }).selectOption(itemIds[1]);
    await page.getByRole("combobox", { name: "변경 견적" }).selectOption(itemIds[2]);
    await page.getByRole("combobox", { name: "영업 원칙" }).selectOption(itemIds[3]);
    await page.getByRole("button", { name: "원문 나란히 보기" }).click();
    await expect(page.getByRole("link", { name: "원문 열기" })).toHaveCount(4);
    await expect(page.getByText(itemRows[2].content, { exact: true })).toBeVisible();
    const firstHref = await page.getByRole("link", { name: "원문 열기" }).first().getAttribute("href");
    expect(firstHref).toBe(`/d/${dept}/evidence/${itemIds[0]}`);
    const originalPage = await context.newPage();
    try {
      await originalPage.goto(`${baseURL}${firstHref}`);
      await expect(originalPage.getByText(itemRows[0].content, { exact: true })).toBeVisible();
    } finally { await originalPage.close(); }
    const crossDept = await page.request.post(`${baseURL}/api/d/${dept}/sales-review/sources`, { data: {
      request_item_id: otherItemId, old_quote_item_id: itemIds[1], new_quote_item_id: itemIds[2], policy_item_id: itemIds[3],
    } });
    expect(crossDept.status()).toBe(404);
    await page.screenshot({ path: "docs/verification/sales-review-source-connection-2026-09-30.png", fullPage: true });

    const member = await browser.newContext();
    try {
      await signIn(member, "review-member@example.test", password);
      const denied = await member.request.get(`${baseURL}/api/d/${dept}/sales-review/sources`);
      expect(denied.status()).toBe(403);
    } finally { await member.close(); }

    const deleted = await service.from("items").update({ deleted_at: new Date().toISOString() }).eq("id", itemIds[2]);
    expect(deleted.error).toBeNull();
    await page.getByRole("button", { name: "원문 나란히 보기" }).click();
    await expect(page.getByText("현재 확인할 수 없는 원문이 있습니다. 다시 선택해 주세요.", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "원문 열기" })).toHaveCount(0);
  } finally {
    await service.from("items").delete().in("id", [...itemIds, otherItemId]);
    await service.from("sources").delete().in("id", [...sourceIds, otherSourceId]);
  }
});
