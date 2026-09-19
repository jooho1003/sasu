// Imports actual components; every /api response is synthetic and intercepted.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = process.cwd(), out = resolve(root, "docs/verification/persona-review-2026-09-18"), lab = resolve(out, "lab");
const server = await createServer({ configFile: false, root: lab, resolve: { alias: [
  { find: "next/navigation", replacement: resolve(lab, "navigation.mjs") },
  { find: "next/link", replacement: resolve(lab, "link.jsx") },
  { find: "@", replacement: root },
] }, server: { host: "127.0.0.1", port: 3194, strictPort: true, fs: { allow: [root] } } });
let browser;
const results = [], errors = [], captured = [], blocked = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await context.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== "http://127.0.0.1:3194") { blocked.push(url.origin); return route.abort(); }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    captured.push({ method: req.method(), path: url.pathname, body: req.postDataJSON() });
    let body;
    if (url.pathname.endsWith("/questions")) body = { questions: [], next: null };
    else if (url.pathname.endsWith("/ask")) body = { answer_id: "synthetic-refused" };
    else if (url.pathname.includes("/answers/")) body = { id: "synthetic-refused", status: "refused", answer: "현재 확인할 수 있는 근거로 답변할 수 없습니다.", refused: true, citations: [] };
    else if (url.pathname.endsWith("/decide")) body = { message: "검토용 요청을 캡처했습니다. 실제 저장하지 않았습니다." };
    else throw new Error("Unexpected API: " + url.pathname);
    return route.fulfill({ json: body });
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:3194/?scenario=card");
  await page.getByRole("button", { name: "결정", exact: true }).click();
  await page.getByText("결정 사유를 입력해주세요.").waitFor();
  results.push({ id: "OBS-01", observation: "빈 결정 사유 제출 차단", pass: captured.length === 0 });
  const editableFields = await page.locator("input,textarea").count();
  await page.getByRole("textbox", { name: "결정 사유" }).fill("가격 정책상 5% 할인만 승인한다. 12% 할인은 승인하지 않는다.");
  await page.getByRole("button", { name: "결정", exact: true }).click();
  await page.getByText("검토용 요청을 캡처했습니다.", { exact: false }).waitFor();
  const decision = captured.find(row => row.path.endsWith("/decide"));
  assert.equal(decision.body.outcome, "고객 A의 12% 할인 요청을 승인한다.");
  assert.equal(editableFields, 1);
  results.push({ id: "OBS-02", observation: "최종 결과 편집 없이 AI 추천이 outcome으로 전송됨", defectReproduced: true, editableFields, sentBody: decision.body });
  await page.screenshot({ path: resolve(out, "card-outcome-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(out, "card-outcome-mobile.png"), fullPage: true });
  await page.goto("http://127.0.0.1:3194/?scenario=readonly");
  await page.getByText("이 카드는 담당자 또는 팀장만 처리할 수 있습니다.").waitFor();
  results.push({ id: "OBS-03", observation: "처리 권한 없는 카드 UI", pass: await page.getByRole("button", { name: "결정", exact: true }).count() === 0, limit: "컴포넌트 속성에 따른 표시 검토, 서버 권한 검증은 아님" });
  await page.goto("http://127.0.0.1:3194/?scenario=deferred");
  await page.getByText("보류된 카드입니다. 팀장이 다시 열 수 있습니다.").waitFor();
  results.push({ id: "OBS-04", observation: "일반 담당자는 보류 후 재개할 수 없음", pass: await page.getByRole("button", { name: "다시 열기" }).count() === 0 });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("http://127.0.0.1:3194/?scenario=ask");
  await page.getByRole("textbox", { name: "무엇이 궁금한가요?" }).fill("고객 A의 할인 요청을 누가 판단하나요?");
  await page.getByRole("button", { name: "묻기", exact: true }).click();
  await page.getByText("근거가 부족하면 결정 카드로 승격해 담당자에게 물어볼 수 있습니다.").waitFor();
  const actions = await page.locator("article button,article a").allTextContents();
  assert.deepEqual(actions, ["이어서 질문하기"]);
  results.push({ id: "OBS-05", observation: "근거 부족의 담당자 인계 CTA 부재", defectReproduced: true, actions });
  await page.screenshot({ path: resolve(out, "ask-refusal-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(out, "ask-refusal-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "이어서 질문하기" }).click();
  await page.getByText("이어서 묻는 질문:", { exact: false }).waitFor();
  results.push({ id: "OBS-06", observation: "이어서 질문하기는 같은 질문 흐름을 연결함", pass: await page.getByRole("textbox", { name: "무엇이 궁금한가요?" }).inputValue() === "" });
  await context.close();
} finally {
  const files = ["components/card-actions.tsx", "components/ask-s4.tsx", "app/(auth)/d/[dept]/cards/[id]/page.tsx", "lib/slack/blocks.ts"];
  writeFileSync(resolve(out, "component-observations.json"), JSON.stringify({ at: new Date().toISOString(), scope: "Actual client components with synthetic intercepted APIs, navigation stubs and simplified CSS. Not a production or RLS verification.", results, errors, blocked, captured, sourceHashes: files.map(file => ({ file, sha256: createHash("sha256").update(readFileSync(resolve(root, file))).digest("hex") })) }, null, 2));
  if (browser) await browser.close();
  await server.close();
}
assert.equal(errors.length, 0);
assert.equal(results.length, 6);
assert.ok(results.every(row => row.pass === true || row.defectReproduced === true));
console.log(JSON.stringify({ observations: results.length, defectsReproduced: results.filter(row => row.defectReproduced).length, errors, blocked }));
