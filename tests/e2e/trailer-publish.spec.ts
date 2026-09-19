import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { loadEnvConfig } from "@next/env";
import { missingEnv, requiredEnv, serviceClient, signInSeedUser } from "./support/auth";
import { DEFAULT_TRAILER_RUBRIC } from "../../lib/trailer-generation";
import { trailerApprovalItems, runTrailerGate } from "../../lib/trailer-gate";
import { loadTrailerInputs } from "../../lib/pipeline/trailer-inputs";
import { mask } from "../../lib/mask";
const QA_TRAILER_DEPT_ID = "fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const QA_TRAILER_DECISIONS = [1, 2, 3, 4, 5, 6].map((n) => `fddddddd-dddd-4ddd-8ddd-dddddddddd0${n}`);
const DEMO_TRAILER_DEPT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", DEMO_TRAILER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccf01", DEMO_TRAILER_SLUG = "onsaemiro2026demotrail";
loadEnvConfig(process.cwd());
test.use({ screenshot: "off", trace: "off", video: "off" });
const live = process.env.E2E_ALLOW_EXTERNAL_WRITES === "1" && process.env.E2E_TRAILER_DB === "1" && !missingEnv(["E2E_BASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SEED_ORG_ADMIN_EMAIL", "SEED_ORG_ADMIN_PASSWORD", "SEED_INVITEE_EMAIL", "SEED_INVITEE_PASSWORD", "SEED_QA_LEAD_EMAIL", "SEED_QA_LEAD_PASSWORD", "JOBS_TRIGGER_SECRET"]).length;
const dept = QA_TRAILER_DEPT_ID;
test.describe("예고편 A · 기본 off · DB 쓰기 없음", () => {
  test.skip(live, "B는 on 서버에서 실행합니다.");
  for (const path of [`/d/${dept}/trailers`, "/t/abcdefghijklmnopqrstuv", "/t/INVALID", `/demo/d/${dept}/trailers`]) test(`${path} → 404`, async ({ request }) => { expect((await request.get(path)).status()).toBe(404); });
  test("생성 API와 메인·게스트 링크가 닫힘", async ({ page, request }) => {
    expect((await request.post(`/api/d/${dept}/trailers`, { data: {} })).status()).toBe(404);
    await page.goto("/demo"); await expect(page.getByRole("link", { name: "채용 예고편 만드는 과정 →" })).toHaveCount(0);
    await page.goto("/"); await expect(page.locator('a[href^="/t/"]')).toHaveCount(0);
  });
});
async function worker(page: Page) { const response = await page.request.post("/api/jobs/run", { headers: { "x-jobs-secret": requiredEnv("JOBS_TRIGGER_SECRET") }, timeout: 120_000 }); expect(response.status()).toBe(200); }
test.describe("예고편 B · O11 운영 승인 후", () => {
  test.skip(!live, "외부 쓰기·실제 생성·QA 계정·on 서버를 명시해야 실행합니다.");
  test("생성·검토·승인·조직 허용·발행·철회·재발행과 일일 한도", async ({ page, context, browser, baseURL }) => {
    test.setTimeout(600_000);
    const lead = await signInSeedUser(context, baseURL!, { emailEnv: "SEED_QA_LEAD_EMAIL", passwordEnv: "SEED_QA_LEAD_PASSWORD" });
    const db = serviceClient();
    const candidates = await lead.supabase.rpc("trailer_candidates", { p_dept: dept });
    const ids = candidates.data.map((row: { decision_id: string }) => row.decision_id);
    expect(ids.includes(QA_TRAILER_DECISIONS[3]) || ids.includes(QA_TRAILER_DECISIONS[4])).toBe(false);
    await page.goto(`/d/${dept}/trailers/new`);
    await page.getByRole("checkbox").nth(0).check(); await page.getByRole("checkbox").nth(1).check();
    const created = page.waitForResponse((r) => r.url().endsWith(`/api/d/${dept}/trailers`) && r.request().method() === "POST");
    await page.getByRole("button", { name: "생성", exact: true }).click();
    const response = await created; expect(response.status()).toBe(202); const id = (await response.json()).trailerId as string;
    const read = async () => { const result = await db.from("trailers").select("id,status,scenarios,updated_at,gate_report,approved_item_ids,slug").eq("id", id).single(); expect(Boolean(result.error)).toBe(false); return result.data!; };
    async function awaitReview() { await worker(page); await expect.poll(async () => (await read()).status, { timeout: 150_000, intervals: [1500, 3000, 5000] }).toBe("review"); }
    await awaitReview();
    await page.goto(`/d/${dept}/trailers/${id}`);
    await expect(page.getByText("자동 검사는 수치·전략이 가상화됐는지 판단하지 못합니다. 항목마다 직접 확인한 뒤 승인하세요.")).toBeVisible();
    let row = await read(); const title = page.getByRole("textbox").first(); await title.fill(`${await title.inputValue()} · 새로운 관점`);
    const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().endsWith(`/trailers/${id}`)); await page.getByRole("button", { name: "수정 저장" }).click(); expect((await saved).status()).toBe(202);
    await awaitReview(); row = await read(); expect(row.approved_item_ids.length).toBe(0); expect(row.gate_report?.passed === true).toBe(true);
    await page.reload(); const approval = page.getByRole("group", { name: /항목별 공개 승인/ }); for (const box of await approval.getByRole("checkbox").all()) await box.check();
    await page.getByRole("button", { name: "공개 승인 저장" }).click(); await expect.poll(async () => (await read()).approved_item_ids.length).toBe(trailerApprovalItems(row.scenarios).length);
    let published = await page.request.post(`/api/d/${dept}/trailers/${id}/publish`); expect(published.status()).toBe(409); expect((await published.json()).error).toBe("trailer_publishing_disabled");
    const adminContext = await browser.newContext();
    try {
      await signInSeedUser(adminContext, baseURL!, { emailEnv: "SEED_ORG_ADMIN_EMAIL", passwordEnv: "SEED_ORG_ADMIN_PASSWORD" }); const adminPage = await adminContext.newPage(); await adminPage.goto(`${baseURL}/admin`);
      await adminPage.getByRole("button", { name: "공개 허용 켜기", exact: true }).click(); await adminPage.getByRole("dialog").getByRole("button", { name: "공개 허용 켜기", exact: true }).click(); await expect(adminPage.getByRole("button", { name: "공개 허용 끄기", exact: true })).toBeVisible();
      published = await page.request.post(`/api/d/${dept}/trailers/${id}/publish`); expect(published.status()).toBe(200); const first = (await published.json()).slug as string;
      const anon = createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } }); const payload = await anon.rpc("public_trailer", { p_slug: first }); expect(Object.keys(payload.data).sort()).toEqual(["apply_url", "scenarios"]);
      const publicContext = await browser.newContext(); try { const publicPage = await publicContext.newPage(); const writes: string[] = []; publicPage.on("request", (r) => { if (!["GET", "HEAD", "OPTIONS"].includes(r.method())) writes.push(r.method()); }); await publicPage.goto(`${baseURL}/t/${first}`); await expect(publicPage.getByText("이 체험의 회사·인물·수치는 가상화되었습니다")).toBeVisible(); expect(writes).toEqual([]); } finally { await publicContext.close(); }
      expect((await page.request.post(`/api/d/${dept}/trailers/${id}/unpublish`)).status()).toBe(200); expect((await page.request.get(`/t/${first}`)).status()).toBe(404);
      row = await read(); row.scenarios[0].title += " · 후속 검토";
      expect((await page.request.patch(`/api/d/${dept}/trailers/${id}`, { data: { scenarios: row.scenarios, seenUpdatedAt: row.updated_at } })).status()).toBe(202); await awaitReview(); row = await read();
      expect((await page.request.post(`/api/d/${dept}/trailers/${id}/approve`, { data: { itemIds: trailerApprovalItems(row.scenarios).map((item) => item.id) } })).status()).toBe(200);
      published = await page.request.post(`/api/d/${dept}/trailers/${id}/publish`); expect(published.status()).toBe(200); const second = (await published.json()).slug as string; expect(second !== first).toBe(true);
      expect((await adminContext.request.post(`${baseURL}/api/admin/trailers/${id}/unpublish`)).status()).toBe(200); expect((await page.request.get(`/t/${second}`)).status()).toBe(404);
      expect((await adminContext.request.post(`${baseURL}/api/admin/trailer-publishing`, { data: { enabled: false } })).status()).toBe(200);
      // Contract: unpublished must be saved before it can return to review.
      expect((await page.request.post(`/api/d/${dept}/trailers/${id}/recheck`)).status()).toBe(409);
      row = await read();
      expect((await page.request.patch(`/api/d/${dept}/trailers/${id}`, { data: { scenarios: row.scenarios, seenUpdatedAt: row.updated_at } })).status()).toBe(202);
      await awaitReview();
      const disabledPublish = await page.request.post(`/api/d/${dept}/trailers/${id}/publish`);
      expect(disabledPublish.status()).toBe(409);
      expect((await disabledPublish.json()).error).toBe("trailer_publishing_disabled");
    } finally { await adminContext.close(); }
    // Dedicated QA reset is the only script mutation; serviceClient above is read-only.
    const reset = () => { const require = createRequire(`${process.cwd()}/package.json`); execFileSync(process.execPath, [require.resolve("tsx/cli"), "scripts/seed-qa-org.ts", "--reset"], { stdio: "pipe" }); };
    reset();
    try {
      const results = await Promise.all(Array.from({length:21},()=>lead.supabase.rpc("create_trailer_draft", { p_dept: dept, p_decision_ids: [QA_TRAILER_DECISIONS[0]], p_banned_terms: [], p_apply_url: null, p_rubric: DEFAULT_TRAILER_RUBRIC })));
      expect(results.filter(result=>!result.error)).toHaveLength(20);expect(results.filter(result=>result.error?.message==="trailer_daily_limit")).toHaveLength(1);
      const count = await db.from("trailers").select("id", { count: "exact", head: true }).eq("dept_id", dept); expect(count.count).toBe(20);
    } finally { reset(); }
  });
  test("게스트 조회는 쓰기·호출 0이며 실제 스냅샷에 원문 겹침 0", async ({ page }) => {
    const db = serviceClient(); const counts = () => Promise.all(["llm_calls", "trailers", "jobs"].map(async (table) => { const r = await db.from(table).select("*", { count: "exact", head: true }); expect(Boolean(r.error)).toBe(false); return r.count; })); const before = await counts();
    await page.goto(`/demo/d/${DEMO_TRAILER_DEPT_ID}/trailers`); await expect(page.getByText("로그인 없이 보기 · 가상 사례", { exact: true })).toBeVisible(); const link = page.getByRole("link", { name: "체험하기 →" }); await expect(link).toHaveAttribute("href", `/t/${DEMO_TRAILER_SLUG}`); await link.click(); await expect(page.getByRole("button", { name: /오피스 입장하기/ })).toBeVisible(); expect(await counts()).toEqual(before);
    const row = await db.from("trailers").select("org_id,dept_id,source_decision_ids,banned_terms,scenarios").eq("id", DEMO_TRAILER_ID).single(); expect(Boolean(row.error)).toBe(false);
    const inputs = await loadTrailerInputs(db, row.data!); const texts = [...inputs.principles, ...inputs.decisions.flatMap((d) => [d.outcome, d.rationale, ...(d.cardTitle ? [d.cardTitle] : [])])]; expect(runTrailerGate(row.data!.scenarios, { sourceTexts: texts.flatMap((text) => [text, mask(text)]), properNouns: inputs.properNouns }).passed).toBe(true);
  });
});
