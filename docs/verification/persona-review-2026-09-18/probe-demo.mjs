// Isolated, anonymous, read-only UX inspection. Never uses the shared MCP profile.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const out = resolve("docs/verification/persona-review-2026-09-18");
mkdirSync(out, { recursive: true });
const origin = "http://localhost:3011";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const blocked = [], errors = [];
await context.route("**/*", async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== origin || !["GET", "HEAD"].includes(request.method()) || url.pathname === "/demo/access") {
    blocked.push({ method: request.method(), path: url.pathname });
    return route.abort();
  }
  return route.continue();
});
const page = await context.newPage();
page.on("pageerror", error => errors.push(error.message.slice(0, 160)));
const results = [];
try {
  for (const [label, path] of [["demo-entry", "/demo"], ["hiring-entry", "/demo/hiring"]]) {
    const response = await page.goto(origin + path, { waitUntil: "networkidle", timeout: 40_000 });
    const links = await page.locator("a").evaluateAll(elements => elements.map(el => ({ text: el.textContent?.trim(), href: el.getAttribute("href") })));
    const headings = await page.locator("h1,h2,h3").allTextContents();
    const text = await page.locator("body").innerText();
    results.push({ label, path, status: response?.status(), finalUrl: page.url(), headings, links, text });
    await page.screenshot({ path: resolve(out, label + ".png"), fullPage: true });
  }
  writeFileSync(resolve(out, "demo-entry-inspection.json"), JSON.stringify({ at: new Date().toISOString(), viewport: "1440x1000", scope: "anonymous local synthetic demo", blocked, errors, results }, null, 2));
  console.log(JSON.stringify({ pages: results.map(({ label, status, headings, links }) => ({ label, status, headings, links })), blocked, errors }));
} finally { await context.close(); await browser.close(); }
