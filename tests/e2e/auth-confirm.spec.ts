// E1 (ADR-088 결정 4, 불변식 53): 메일 링크의 token_hash로 /auth/confirm이 서버에서 세션을 만들고,
// 같은 토큰은 다시 쓰지 못한다. 격리 로컬 QA 서버(scripts/review-qa.mjs setup → build → start, :3011)에서만 실행한다.
// 로컬 Supabase 주소·서비스 키는 review-qa.mjs와 같은 `supabase status --workdir .vercel/review-qa`에서 읽고,
// 서비스 키는 이 테스트 프로세스의 generateLink·시드 확인에만 쓴다. 앱 요청에는 넣지 않는다.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "";
const localApp = /^http:\/\/(127\.0\.0\.1|localhost):3011$/u.test(baseURL);

test.skip(!localApp, "격리 로컬 QA 서버(:3011)에서만 실행합니다.");
test.use({ screenshot: "off", trace: "off", video: "off" });

// `next start`를 -H 없이 띄우면 request.url이 localhost 기준이라 서버 리디렉션도 localhost로 간다.
// 세션 쿠키가 붙는 호스트와 리디렉션 호스트를 맞추기 위해 브라우저는 localhost로 연다.
const appOrigin = localApp ? `http://localhost:${new URL(baseURL).port}` : "";
// scripts/review-qa.mjs setup이 만드는 합성 팀원(review-${role}@example.test).
const MEMBER_EMAIL = "review-member@example.test";

function localServiceClient(): SupabaseClient {
  let status: { API_URL?: string; SERVICE_ROLE_KEY?: string };
  try {
    status = JSON.parse(execSync("npx --yes supabase status --workdir .vercel/review-qa -o json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }));
  } catch {
    throw new Error("local_supabase_required");
  }
  if (!status.API_URL || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/u.test(status.API_URL) || !status.SERVICE_ROLE_KEY) {
    throw new Error("local_supabase_required");
  }
  return createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

test("형식이 틀린 링크는 로그인 화면으로 보내고 응답을 캐시·Referer로 남기지 않는다", async ({ request }) => {
  for (const query of ["token_hash=not.valid&type=email", `token_hash=${"a".repeat(56)}&type=recovery`, "type=email"]) {
    const response = await request.get(`${appOrigin}/auth/confirm?${query}`, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    const location = new URL(response.headers().location ?? "", appOrigin);
    expect(`${location.pathname}${location.search}`).toBe("/login?error=auth_callback");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
});

test("메일 링크 token_hash로 부서 화면에 도착하고 같은 토큰은 다시 쓰지 못한다", async ({ browser }) => {
  test.setTimeout(90_000);
  const ids = JSON.parse(readFileSync(".vercel/review-qa/ids.json", "utf8")) as { member: string };
  const service = localServiceClient();

  // postLoginPath와 같은 기준(dept_id 오름차순 첫 부서)으로 도착 부서를 정한다.
  const first = await service.from("members").select("dept_id, consented_at")
    .eq("user_id", ids.member).order("dept_id", { ascending: true }).limit(1).maybeSingle();
  expect(first.error).toBeNull();
  expect(first.data?.consented_at, "review-qa setup의 합성 팀원은 동의 상태여야 합니다.").toBeTruthy();
  const deptPath = `/d/${first.data!.dept_id}`;

  const generated = await service.auth.admin.generateLink({ type: "magiclink", email: MEMBER_EMAIL });
  expect(generated.error).toBeNull();
  expect(generated.data.user?.id).toBe(ids.member);
  const tokenHash = generated.data.properties?.hashed_token ?? "";
  expect(/^[A-Za-z0-9_-]{1,512}$/u.test(tokenHash)).toBe(true);
  const confirmUrl = `${appOrigin}/auth/confirm?${new URLSearchParams({ token_hash: tokenHash, type: "email" })}`;

  // 새 브라우저 컨텍스트: 로그인 요청을 보낸 브라우저의 PKCE verifier·쿠키가 없어도 로그인되어야 한다.
  const fresh = await browser.newContext();
  try {
    const page = await fresh.newPage();
    await page.goto(confirmUrl);
    await page.waitForURL((url) => url.pathname === deptPath);
    expect(page.url()).not.toContain(tokenHash);
  } finally {
    await fresh.close();
  }

  const replay = await browser.newContext();
  try {
    const page = await replay.newPage();
    await page.goto(confirmUrl);
    await page.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("error") === "auth_callback");
    expect(page.url()).not.toContain(tokenHash);
    await expect(page.getByText("로그인 링크를 더는 쓸 수 없습니다", { exact: false })).toBeVisible();
  } finally {
    await replay.close();
  }
});
