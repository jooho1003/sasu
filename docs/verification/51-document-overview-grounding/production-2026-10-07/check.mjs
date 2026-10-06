// Production check after #44/#45 (2026-10-07). Public pages + seed QA lead flow. Writes one synthetic document in the seed QA dept and deletes it.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";

nextEnv.loadEnvConfig(process.cwd());
const BASE = "https://getsasu.com";
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const report = { base: BASE, at: new Date().toISOString(), pages: [], flow: {} };
const SOURCE = [
  "운영 확인용 합성 문서 (2026-10-07)",
  "정책: 50만원을 넘는 소모품 구매는 팀장 확인 후 진행한다.",
  "박대리는 이번 주 금요일까지 비품 목록을 정리해 공유한다.",
  "다음 회의에서 사무용 의자 교체 여부를 결정하기로 했다.",
  "노트북 교체 주기를 3년으로 할지 4년으로 할지는 아직 정하지 않았다.",
].join("\n");

async function inspect(page, name, url, width) {
  const errors = [];
  const onConsole = (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); };
  const onPageError = (e) => errors.push(`pageerror:${String(e.message).slice(0, 200)}`);
  page.on("console", onConsole); page.on("pageerror", onPageError);
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  const res = await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 }).catch((e) => ({ status: () => `nav_error:${e.message.slice(0, 80)}` }));
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => ({
    title: document.title,
    h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()).slice(0, 3),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    imgsBroken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src).slice(0, 5),
    smallTapTargets: [...document.querySelectorAll("a,button")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 32 || r.width < 32) && getComputedStyle(el).visibility !== "hidden"; }).length,
  }));
  await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: true });
  page.off("console", onConsole); page.off("pageerror", onPageError);
  report.pages.push({ name, url: page.url(), width, status: typeof res?.status === "function" ? res.status() : null, ...m, consoleErrors: errors });
}

const browser = await chromium.launch();
const context = await browser.newContext({ locale: "ko-KR" });
const page = await context.newPage();
try {
  for (const w of [1440, 390]) {
    await inspect(page, "landing", `${BASE}/`, w);
    await inspect(page, "demo", `${BASE}/demo`, w);
  }

  // Seed QA lead session (same mechanism as tests/e2e/vertical-slice.spec.ts).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await sb.auth.signInWithPassword({ email: process.env.SEED_LEAD_EMAIL, password: process.env.SEED_LEAD_PASSWORD });
  if (signIn.error) throw new Error(`sign_in:${signIn.error.message}`);
  const session = signIn.data.session;
  const ref = new URL(url).hostname.split(".")[0];
  const b64 = Buffer.from(JSON.stringify(session), "utf8").toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  await context.addCookies([{ name: `sb-${ref}-auth-token`, value: `base64-${b64}`, url: BASE, httpOnly: true, secure: true, sameSite: "Lax" }]);
  const authed = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${session.access_token}` } } });
  const mem = await authed.from("members").select("dept_id,role").eq("user_id", session.user.id).eq("role", "lead").limit(1).single();
  if (mem.error) throw new Error(`membership:${mem.error.message}`);
  const dept = mem.data.dept_id;
  report.flow.dept = "seed-qa-lead";

  for (const w of [1440, 390]) {
    await inspect(page, "dashboard", `${BASE}/d/${dept}`, w);
    await inspect(page, "documents", `${BASE}/d/${dept}/documents`, w);
  }

  // Upload a synthetic document through the documents page.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/d/${dept}/documents`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "문서 추가" }).click();
  await page.getByLabel("문서 파일").setInputFiles({ name: "운영확인-합성-20261007.txt", mimeType: "text/plain", buffer: Buffer.from(SOURCE) });
  await page.getByRole("button", { name: "문서 정리 시작" }).click();
  await page.waitForURL(/\/reviews\/[0-9a-f-]+$/, { timeout: 60_000 });
  const reviewId = page.url().split("/").at(-1);
  report.flow.reviewId = reviewId;
  const getReview = async () => (await (await context.request.get(`${BASE}/api/d/${dept}/reviews/${reviewId}`)).json()).review;
  let review;
  for (let i = 0; i < 60; i++) { review = await getReview(); if (["ready", "failed"].includes(review?.status)) break; await page.waitForTimeout(3000); }
  report.flow.reviewStatus = review?.status;
  if (review?.status !== "ready") throw new Error(`review_not_ready:${review?.status}`);
  await page.reload({ waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/review-ready-1440.png`, fullPage: true });
  await page.getByLabel(/전문과 빠짐·오류를 확인했습니다/).check();
  await page.getByRole("button", { name: "확인 후 확정", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "확정했습니다" }).first().waitFor({ timeout: 30_000 });

  // Wait for the document summary job.
  let doc;
  for (let i = 0; i < 60; i++) {
    const list = await (await context.request.get(`${BASE}/api/d/${dept}/documents`)).json();
    doc = (list.documents ?? []).find((d) => (d.title ?? "").includes("운영확인-합성-20261007"));
    if (doc && ["summarized", "summary_failed"].includes(doc.status)) break;
    await page.waitForTimeout(5000);
  }
  report.flow.documentStatus = doc?.status ?? "not_found";
  report.flow.statusReason = doc?.status_reason ?? null;
  const summary = doc?.summary ?? null;
  if (summary) {
    const norm = (t) => t.replace(/\s+/g, " ").trim();
    const sentences = summary.overview.split(/(?<=[.!?。])\s+|\n+/).map(norm).filter(Boolean);
    report.flow.overview = summary.overview;
    report.flow.overviewSentencesNotInSource = sentences.filter((s) => !norm(SOURCE).includes(s));
    report.flow.keyPoints = summary.key_points.map((e) => e.text);
    report.flow.decisions = summary.decisions.map((e) => e.text);
    report.flow.actions = summary.actions.map((e) => e.text);
    report.flow.openQuestions = summary.open_questions.map((e) => e.text);
    report.flow.citations = summary.citations.length;
  }
  for (const w of [1440, 390]) {
    await page.setViewportSize({ width: w, height: w < 600 ? 844 : 900 });
    await page.goto(`${BASE}/d/${dept}/documents`, { waitUntil: "networkidle" });
    const pick = page.getByRole("button", { name: /운영확인-합성-20261007/ }).first();
    if (await pick.count()) await pick.click();
    await page.waitForTimeout(800);
    const overviewSection = page.locator(".document-overview");
    report.flow[`overviewVisible${w}`] = await overviewSection.isVisible().catch(() => false);
    report.flow[`overviewText${w}`] = report.flow[`overviewVisible${w}`] ? (await overviewSection.innerText()).slice(0, 300) : null;
    report.flow[`overflowX${w}`] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.screenshot({ path: `${OUT}/document-summary-${w}.png`, fullPage: true });
  }

  // Cleanup: delete the synthetic material.
  review = await getReview();
  const del = await context.request.post(`${BASE}/api/d/${dept}/reviews/${reviewId}`, { data: { action: "delete", revision: review.revision } });
  report.flow.cleanup = { status: del.status() };
  const after = await (await context.request.get(`${BASE}/api/d/${dept}/documents`)).json();
  report.flow.cleanup.documentStillListed = (after.documents ?? []).some((d) => (d.title ?? "").includes("운영확인-합성-20261007"));
} catch (e) {
  report.error = e instanceof Error ? e.message : String(e);
  await page.screenshot({ path: `${OUT}/error.png`, fullPage: true }).catch(() => {});
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify({ error: report.error ?? null, flow: report.flow, pages: report.pages.map((p) => [p.name, p.width, p.status, p.overflowX, p.consoleErrors.length, p.imgsBroken.length]) }, null, 1));
}
