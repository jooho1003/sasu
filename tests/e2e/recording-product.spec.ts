import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

loadEnvConfig(process.cwd());

const dept = "22222222-2222-4222-8222-222222222222";
const org = "11111111-1111-4111-8111-111111111111";
const base = "http://127.0.0.1:3200";
const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for local product E2E`);
  return value;
};

test("authenticated production build records and saves synthetic audio through real local services", async ({ page, context }) => {
  test.setTimeout(300_000);
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const key = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await auth.auth.signInWithPassword({ email: required("SEED_LEAD_EMAIL"), password: required("SEED_LEAD_PASSWORD") });
  expect(login.error).toBeNull();
  const session = login.data.session!;
  const cookies: { name: string; value: string }[] = [];
  const ssr = createServerClient(url, key, { cookies: {
    getAll: () => [],
    setAll: (next) => { cookies.splice(0, cookies.length, ...next.map(({ name, value }) => ({ name, value }))); },
  } });
  const adopted = await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  expect(adopted.error).toBeNull();
  expect(cookies.length).toBeGreaterThan(0);
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: base })));
  const speech = await readFile("tests/fixtures/synthetic-meeting-ko.wav");
  await page.route("**/__synthetic_meeting.wav", (route) => route.fulfill({ contentType: "audio/wav", body: speech }));
  await page.addInitScript(() => {
    const state = window as typeof window & { violations: string[]; fakeAudioContexts: AudioContext[] };
    state.violations = [];
    state.fakeAudioContexts = [];
    document.addEventListener("securitypolicyviolation", (event) => state.violations.push(event.effectiveDirective));
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => {
      const audio = new AudioContext();
      await audio.resume();
      const source = audio.createBufferSource();
      const response = await fetch("/__synthetic_meeting.wav");
      source.buffer = await audio.decodeAudioData(await response.arrayBuffer());
      source.loop = true;
      const destination = audio.createMediaStreamDestination();
      source.connect(destination);
      source.start();
      state.fakeAudioContexts.push(audio);
      return destination.stream;
    } });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    const path = new URL(page.url()).pathname;
    errors.push(`${path}: ${error.message}`);
  });
  const response = await page.goto(`/d/${dept}/reviews/record`);
  expect(response?.status()).toBe(200);
  const policy = response?.headers()[process.env.SASU_CSP_ENFORCE === "true" ? "content-security-policy" : "content-security-policy-report-only"];
  expect(policy).toContain("worker-src 'self' blob:");
  await expect(page.getByLabel("회의 제목")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByLabel("회의 제목").focus();
  await expect(page.getByLabel("회의 제목")).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel("회의 제목").fill("로컬 합성 검증 회의");
  await page.getByRole("checkbox", { name: /참석자 전원 녹음 동의/ }).check();
  await page.getByRole("button", { name: "5초 테스트 녹음" }).click();
  await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/, { timeout: 15_000 });
  await page.getByRole("checkbox", { name: /테스트를 듣고/ }).check();
  await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await expect(page.getByRole("button", { name: "녹음 종료" })).toBeVisible();
  await expect.poll(async () => (await page.getByText(/이 기기에 저장됨/).textContent())?.includes("0:08"), { timeout: 20_000 }).toBe(true);
  await page.getByRole("button", { name: "녹음 종료" }).click();
  await page.getByRole("button", { name: "녹음 끝내기" }).click();
  await expect(page.getByRole("button", { name: "음성 저장하고 받아쓰기" })).toBeVisible();
  await page.getByRole("button", { name: "음성 저장하고 받아쓰기" }).click();
  // 로컬에는 분 단위 cron이 없다. 이전 검증의 대기 job이 남아 있어도
  // 원본 검증 job을 처리할 수 있도록 같은 워커 엔드포인트를 구동한다.
  await expect.poll(async () => {
    if (/\/reviews\/[0-9a-f-]+$/.test(page.url())) return page.url();
    const run = await fetch(`${base}/api/jobs/run`, { method: "POST",
      headers: { "x-jobs-secret": required("JOBS_TRIGGER_SECRET") } });
    expect(run.status).toBe(200);
    return page.url();
  }, { timeout: 120_000, intervals: [1000] }).toMatch(/\/reviews\/[0-9a-f-]+$/);
  const reviewId = page.url().split("/").at(-1)!;
  const review = await auth.from("reviewed_materials").select("original_layout,capture_metadata,status").eq("id", reviewId).single();
  expect(review.error).toBeNull();
  expect(review.data?.original_layout).toBe("audio_segments");
  expect(review.data?.capture_metadata?.levels?.microphone).toBeTruthy();
  expect(Buffer.from(review.data!.capture_metadata!.levels.microphone, "base64").length).toBeGreaterThanOrEqual(7);
  expect(review.data?.capture_metadata?.health?.checkpoint_delays).toBeGreaterThanOrEqual(0);
  expect(review.data?.capture_metadata?.health?.max_sample_wall_gap_ms).toBeGreaterThanOrEqual(0);
  expect(review.data?.capture_metadata?.meeting?.provider).toBe("in_person");
  let ready = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    const run = await fetch(`${base}/api/jobs/run`, { method: "POST",
      headers: { "x-jobs-secret": required("JOBS_TRIGGER_SECRET") } });
    expect(run.status).toBe(200);
    const current = await auth.from("reviewed_materials").select("status,sections").eq("id", reviewId).single();
    if (current.data?.status === "ready" && current.data.sections?.length) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  expect(ready).toBe(true);
  await page.reload();
  const firstSection = page.getByLabel("구간 1 텍스트");
  await expect(firstSection).toBeVisible();
  const recognized = await firstSection.inputValue();
  expect(recognized.length).toBeGreaterThan(5);
  await firstSection.fill(`${recognized} 검수 완료.`);
  await page.getByRole("button", { name: "초안 저장" }).click();
  await page.getByRole("checkbox", { name: /전문과 빠짐·오류를 확인했습니다/ }).check();
  await page.getByRole("button", { name: "확인 후 확정" }).click();
  await expect(page.getByRole("link", { name: "확정 자료 요약 보기" })).toBeVisible();
  await page.screenshot({ path: "docs/verification/browser-meeting-recording/step2-product-local-synthetic.png", fullPage: true });
  const published = await auth.from("reviewed_materials").select("published_source_id,confirmed_at").eq("id", reviewId).single();
  expect(published.data?.published_source_id).toBeTruthy();
  expect(published.data?.confirmed_at).toBeTruthy();
  const service = createClient(url, required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sourceId = published.data!.published_source_id!;
  await expect.poll(async () => {
    const result = await service.from("document_summaries").select("status,summary").eq("source_id", sourceId).single();
    return result.data?.status === "summarized" && Array.isArray(result.data.summary?.citations) &&
      result.data.summary.citations.length > 0;
  }, { timeout: 90_000 }).toBe(true);
  const sourceItems = await service.from("items").select("id").eq("source_id", sourceId);
  expect(sourceItems.data?.length).toBeGreaterThan(0);
  await expect.poll(async () => {
    const result = await service.from("classifications").select("item_id").in("item_id", sourceItems.data!.map((item) => item.id));
    return result.data?.length ?? 0;
  }, { timeout: 90_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as typeof window & { violations: string[] }).violations)).toEqual([]);
  expect(errors).toEqual([]);
});

test("local organization switch controls the recording entry while recorded materials keep their badge", async ({ page, context }) => {
  test.setTimeout(120_000);
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const parsed = new URL(url);
  expect(["localhost", "127.0.0.1"]).toContain(parsed.hostname);
  const anon = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const service = createClient(url, required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const current = await service.from("org_settings").select("browser_recording_enabled").eq("org_id", org).single();
  expect(current.error).toBeNull();
  const dbContainer = process.env.SASU_TEST_DOCKER_DB_CONTAINER ?? "supabase_db_sasu";
  expect(["supabase_db_sasu", "supabase_db_review-qa"]).toContain(dbContainer);
  const setRecording = (enabled: boolean) => {
    execFileSync("docker", ["exec", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-q", "-c",
      `update public.org_settings set browser_recording_enabled = ${enabled ? "true" : "false"} where org_id = '${org}'`], { stdio: "pipe" });
  };
  const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await auth.auth.signInWithPassword({ email: required("SEED_LEAD_EMAIL"), password: required("SEED_LEAD_PASSWORD") });
  expect(login.error).toBeNull();
  const cookies: { name: string; value: string }[] = [];
  const ssr = createServerClient(url, anon, { cookies: {
    getAll: () => [],
    setAll: (next) => { cookies.splice(0, cookies.length, ...next.map(({ name, value }) => ({ name, value }))); },
  } });
  const adopted = await ssr.auth.setSession({ access_token: login.data.session!.access_token, refresh_token: login.data.session!.refresh_token });
  expect(adopted.error).toBeNull();
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: base })));
  try {
    setRecording(false);
    const offResponse = page.waitForResponse((response) => response.url().endsWith(`/api/d/${dept}/reviews`) && response.request().method() === "GET");
    await page.goto(`/d/${dept}/reviews`);
    await offResponse;
    await expect(page.getByRole("link", { name: "회의 녹음", exact: true })).toHaveCount(0);
    await expect(page.locator(".review-list .badge").filter({ hasText: "회의 녹음" }).first()).toBeVisible();
    await page.screenshot({ path: "docs/verification/recording-ux-2026-09-29/s8-entry-off-1440.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "docs/verification/recording-ux-2026-09-29/s8-entry-off-390.png", fullPage: true });
    await page.goto(`/d/${dept}/reviews/record`);
    await expect(page.getByText("조직에서 웹 회의 녹음을 껐습니다. 파일 가져오기를 이용해 주세요.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "회의 제목" })).toHaveCount(0);
    await page.screenshot({ path: "docs/verification/recording-ux-2026-09-29/s8-record-off-390.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: "docs/verification/recording-ux-2026-09-29/s8-record-off-1440.png", fullPage: true });

    setRecording(true);
    const onResponse = page.waitForResponse((response) => response.url().endsWith(`/api/d/${dept}/reviews`) && response.request().method() === "GET");
    await page.goto(`/d/${dept}/reviews`);
    await onResponse;
    await expect(page.getByRole("link", { name: "회의 녹음", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: "docs/verification/recording-ux-2026-09-29/s8-entry-on-1440.png", fullPage: true });
    await page.goto(`/d/${dept}/reviews/record`);
    await expect(page.getByRole("textbox", { name: "회의 제목" })).toBeVisible();
  } finally {
    setRecording(current.data!.browser_recording_enabled);
  }
});
