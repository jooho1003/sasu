// Actual components and app CSS; synthetic HTTP responses; no external requests.
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = process.cwd(), out = resolve(root, "docs/verification/grounded-answer-selection-2026-09-23"), lab = resolve(out, "lab");
const origin = "http://127.0.0.1:3196";
const server = await createServer({ configFile: false, root: lab, resolve: { alias: [
  { find: "next/link", replacement: resolve(lab, "link.tsx") }, { find: "@", replacement: root },
] }, css: { postcss: root }, server: { host: "127.0.0.1", port: 3196, strictPort: true, fs: { allow: [root] } } });
let browser;
const results = [], errors = [];
const quote = "인상률 10% 이상이면 승인하지 않습니다.\n<script>unsafe()</script>";
const lead = "관련 부서 기록 1개를 찾았습니다. 아래 원문을 확인해 주세요.";
try {
  await server.listen(); browser = await chromium.launch({ headless: true });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    let hidden = false;
    let highlight = true;
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname.includes("/evidence/")) return route.fulfill({ status: hidden ? 404 : 200, json: hidden ? { error: "이 원문을 확인할 수 없습니다." } : { kind: "document", highlight: highlight && url.searchParams.get("answer") === "answer" ? quote : null, id: "item", title: "회의에서 정한 견적 기준", author: "구매팀", content: quote + "\n\n재입찰은 구매팀이 진행합니다.\n<script>unsafe()</script>" } });
      if (url.pathname.endsWith("/ask")) return route.fulfill({ status: 202, json: { answer_id: "answer" } });
      if (url.pathname.includes("/answers/")) return route.fulfill({ json: { id: "answer", status: "done", refused: false, answer: lead, citations: [{ quote, author: "구매팀", source: "견적 기준", href: "/d/dept/evidence/item?answer=answer" }] } });
      if (url.pathname.endsWith("/questions")) return route.fulfill({ json: { questions: [], next: null } });
      if (url.pathname.endsWith("/slack/questions")) return route.fulfill({ json: { questions: [] } });
      return route.fulfill({ json: { questions: [], next: null } });
    });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    // A new isolated lab may need a cold Vite dependency build on Windows.
    page.setDefaultNavigationTimeout(120_000);
    page.setDefaultTimeout(15_000);
    await page.goto(origin);
    await page.locator("#ask-question").fill("12% 인상 견적을 승인할 수 있나요?");
    await page.getByRole("button", { name: "묻기", exact: true }).click();
    await expect(page.getByText(lead, { exact: true })).toBeVisible();
    const sourceLink = page.getByRole("link", { name: /원문 보기/ });
    await expect(sourceLink).toHaveAttribute("href", "/d/dept/evidence/item?answer=answer");
    assert.equal((await page.locator("article").innerText()).replace(/\s/g, "").split(quote.replace(/\s/g, "")).length, 2);
    await page.screenshot({ path: resolve(out, `ask-${width}.png`), fullPage: true });
    await sourceLink.click();
    await expect(page.getByRole("heading", { name: "원문 확인" })).toBeVisible();
    await expect(page.locator("blockquote")).toContainText(quote);
    await expect(page.locator("blockquote script")).toHaveCount(0);
    await expect(page.locator("mark")).toHaveText(quote);
    await expect(page.locator("mark script")).toHaveCount(0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: resolve(out, `evidence-${width}.png`), fullPage: true });
    highlight = false; await page.reload();
    await expect(page.locator("blockquote")).toContainText(quote);
    await expect(page.locator("mark")).toHaveCount(0);
    await expect(page.getByText("저장된 원문입니다. 개인정보는 가려져 있습니다.")).toBeVisible();
    hidden = true; await page.reload();
    await expect(page.getByRole("alert")).toContainText("확인할 수 없습니다");
    await expect(page.locator("blockquote")).toHaveCount(0);
    await page.screenshot({ path: resolve(out, `evidence-hidden-${width}.png`), fullPage: true });
    results.push({ width, questionToCitationToSource: true, revokedSourceHidden: true, htmlEscaped: true, exactHighlight: true, unavailableHighlightStillReadable: true, horizontalOverflow: false });
    await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(resolve(out, "browser.json"), JSON.stringify({ scope: "actual components and CSS; all API responses mocked; external traffic blocked", results, errors }, null, 2));
  console.log(JSON.stringify({ passed: results.length * 6, failed: 0, widths: [1440, 390], externalRequests: 0 }));
} finally { await browser?.close(); await server.close(); }
