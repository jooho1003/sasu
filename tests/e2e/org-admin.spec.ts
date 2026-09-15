import { expect, test, type BrowserContext } from "@playwright/test";
import { createClient, type Session } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { AdminOverview, AdminMemberRow, AdminAnswerStatRow } from "../../lib/contracts";
import { missingEnv, requiredEnv, serviceClient, signInSeedUser, SEED_MEMBER } from "./support/auth";

loadEnvConfig(process.cwd());
test.use({ screenshot: "off", trace: "off", video: "off" });
const live = process.env.E2E_ALLOW_EXTERNAL_WRITES === "1" && process.env.E2E_ORG_ADMIN_DB === "1" && missingEnv([
  "E2E_BASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "SEED_ORG_ADMIN_EMAIL", "SEED_ORG_ADMIN_PASSWORD", "SEED_INVITEE_EMAIL", "SEED_INVITEE_PASSWORD", "SEED_MEMBER_EMAIL", "SEED_MEMBER_PASSWORD",
]).length === 0;
const adminCredentials = { emailEnv: "SEED_ORG_ADMIN_EMAIL", passwordEnv: "SEED_ORG_ADMIN_PASSWORD" };

test.describe("조직 관리자 A · 기본 off · DB 쓰기 없음", () => {
  test.skip(live, "B 그룹은 on 서버에서 실행합니다.");
  for (const path of ["/admin", "/admin/members", "/admin/sources", "/admin/audit", "/invite/abc", "/demo/admin"]) {
    test(`${path} → 404`, async ({ request }) => { expect((await request.get(path)).status()).toBe(404); });
  }
  test("부서 생성 API가 비활성이고 데모 진입 링크가 없다", async ({ request, page }) => {
    expect((await request.post("/api/admin/departments", { data: { name: "실행되지 않는 요청" } })).status()).toBe(404);
    await page.goto("/demo");
    await expect(page.locator('a[href="/demo/admin"]')).toHaveCount(0);
  });
});

async function injectMagicSession(context: BrowserContext, baseURL: string, session: Session) {
  const ref = new URL(requiredEnv("NEXT_PUBLIC_SUPABASE_URL")).hostname.split(".")[0];
  await context.addCookies([{ name: `sb-${ref}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, url: new URL(baseURL).origin, httpOnly: true, sameSite: "Lax", secure: baseURL.startsWith("https://") }]);
}

test.describe("조직 관리자 B · O10 QA 조직 검증", () => {
  test.skip(!live, "O10: 외부 쓰기 허용·QA 계정·on 서버를 모두 명시해야 실행됩니다.");
  const createdDepartments: string[] = [];
  test.afterAll(() => { if (createdDepartments.length) console.info(JSON.stringify({ qa_department_ids: createdDepartments, cleanup: "seed-qa-org --reset" })); });

  test("부서 생성 → 첫 부서장 초대 → 매직링크 → 수락 → 동의 → 부서 도착과 권한 경계", async ({ browser, page, context, baseURL }) => {
    test.setTimeout(180_000);
    const admin = await signInSeedUser(context, baseURL!, adminCredentials);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "조직 개요" })).toBeVisible();
    const departmentName = `E2E-${Date.now()}`;
    await page.getByRole("button", { name: /^(첫 )?부서 만들기$/ }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("부서 이름").fill(departmentName);
    await dialog.getByRole("button", { name: /^(첫 )?부서 만들기$/ }).click();
    const row = page.getByRole("row").filter({ hasText: departmentName });
    await expect(row.getByText("부서장 없음")).toBeVisible();
    await row.getByRole("button", { name: "첫 부서장 초대" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("초대할 이메일").fill(requiredEnv("SEED_ORG_ADMIN_EMAIL"));
    await dialog.getByRole("button", { name: "첫 부서장 초대" }).click();
    await expect(dialog.getByRole("status")).toContainText("본인");
    await dialog.getByLabel("초대할 이메일").fill(requiredEnv("SEED_INVITEE_EMAIL"));
    await dialog.getByRole("button", { name: "첫 부서장 초대" }).click();
    await expect(dialog.getByLabel("초대 링크")).toBeVisible();
    const invitePath = new URL(await dialog.getByLabel("초대 링크").inputValue()).pathname;
    await dialog.getByRole("button", { name: "닫기" }).click();

    // R10: a second email cannot retain another first-lead invitation.
    await row.getByRole("button", { name: "첫 부서장 초대" }).click();
    await dialog.getByLabel("초대할 이메일").fill(requiredEnv("SEED_MEMBER_EMAIL"));
    await dialog.getByRole("button", { name: "첫 부서장 초대" }).click();
    await expect(dialog.getByRole("status")).toContainText("이미 대기 중");
    await expect(dialog.getByRole("button", { name: "기존 초대 철회 후 새 링크" })).toBeVisible();
    await dialog.getByRole("button", { name: "취소" }).click();

    const overview = await admin.supabase.rpc("admin_overview");
    const parsed = AdminOverview.parse(overview.data);
    const deptId = parsed.departments.find((dept) => dept.name === departmentName)!.dept_id;
    createdDepartments.push(deptId);
    const wrongContext = await browser.newContext();
    try {
      await signInSeedUser(wrongContext, baseURL!, SEED_MEMBER);
      const wrongPage = await wrongContext.newPage();
      await wrongPage.goto(`${baseURL}${invitePath}`);
      await wrongPage.getByLabel("표시 이름").fill("QA 다른 계정");
      await wrongPage.getByRole("button", { name: "초대 수락" }).click();
      await expect(wrongPage.getByText("다른 계정으로 로그인되어 있습니다", { exact: true })).toBeVisible();
      await expect(wrongPage.locator('form[action="/auth/signout"]')).toBeVisible();
    } finally { await wrongContext.close(); }

    await page.getByRole("button", { name: "로그아웃", exact: true }).click();
    await page.goto(invitePath);
    const login = page.getByRole("link", { name: "이 이메일로 로그인" });
    const loginHref = await login.getAttribute("href");
    expect(new URL(loginHref!, baseURL).searchParams.get("next") === invitePath).toBe(true);
    await login.click();
    const db = serviceClient();
    const generated = await db.auth.admin.generateLink({ type: "magiclink", email: requiredEnv("SEED_INVITEE_EMAIL") });
    expect(Boolean(generated.error)).toBe(false);
    const anon = createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const verified = await anon.auth.verifyOtp({ type: "magiclink", token_hash: generated.data.properties!.hashed_token });
    expect(Boolean(verified.data.session)).toBe(true);
    await injectMagicSession(context, baseURL!, verified.data.session!);
    await page.goto(invitePath);
    await page.getByLabel("표시 이름").fill("QA 새 부서장");
    await page.getByRole("button", { name: "초대 수락" }).click();
    await page.waitForURL(/\/consent\?next=/);
    await page.getByRole("button", { name: "동의합니다", exact: true }).click();
    await page.waitForURL(`**/d/${deptId}`);
    await page.goto(`/d/${deptId}/settings`);
    await page.getByRole("button", { name: "멤버 초대", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("초대할 이메일").fill(requiredEnv("SEED_MEMBER_EMAIL"));
    await dialog.getByRole("button", { name: "멤버 초대", exact: true }).click();
    await expect(dialog.getByLabel("초대 링크")).toBeVisible();
    await dialog.getByRole("button", { name: "닫기" }).click();
    await signInSeedUser(context, baseURL!, adminCredentials);
    await page.goto("/admin/members");
    const memberRow = page.getByRole("row").filter({ hasText: departmentName });
    await expect(memberRow.getByRole("button", { name: "부서장 해제" })).toHaveCount(0);
    await memberRow.getByRole("button", { name: "제외", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "제외", exact: true }).click();
    await expect(dialog.getByRole("status")).toContainText("부서장");
    const demote = await context.request.post(`${baseURL}/api/admin/members/demote`, { data: { deptId, userId: verified.data.session!.user.id } });
    expect((await demote.json()).error).toBe("last_lead");
  });

  test("관리 RPC는 메타데이터만 반환하고 답변은 일별·부서별 집계다", async ({ context, baseURL }) => {
    const { supabase } = await signInSeedUser(context, baseURL!, adminCredentials);
    for (const [name, schema, args] of [
      ["admin_overview", AdminOverview, undefined], ["admin_members", AdminMemberRow.array(), undefined],
      ["admin_answer_stats", AdminAnswerStatRow.array(), { p_from: "2026-09-01", p_to: "2026-09-30" }],
    ] as const) {
      const response = await supabase.rpc(name, args);
      expect(Boolean(response.error)).toBe(false);
      expect(schema.safeParse(response.data).success).toBe(true);
    }
  });

  test("/demo/admin: 이메일·초대·관리 기록 없음, LLM·DB 쓰기 0", async ({ page }) => {
    const db = serviceClient();
    const counts = () => Promise.all(["llm_calls", "member_invites", "admin_events", "members"].map(async (table) => {
      const result = await db.from(table).select("*", { count: "exact", head: true });
      expect(Boolean(result.error)).toBe(false); return result.count;
    }));
    const before = await counts();
    const writes: string[] = [];
    page.on("request", (request) => { if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(request.method()); });
    await page.goto("/demo/admin");
    await expect(page.getByText("게스트 모드 · 읽기 전용", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "멤버", exact: true })).toBeVisible();
    expect(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(await page.content())).toBe(false);
    await expect(page.getByText("대기 중 초대", { exact: true })).toHaveCount(0);
    await expect(page.getByText("관리 기록", { exact: true })).toHaveCount(0);
    expect(await counts()).toEqual(before);
    expect(writes).toEqual([]);
  });
});
