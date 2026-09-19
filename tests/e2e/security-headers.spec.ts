import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

test("baseline headers and distinct report-only nonces cover pages, API errors and disabled features", async ({ request }) => {
  const observed: Record<string, unknown> = {};
  const nonces = new Set<string>();
  for (const path of ["/", "/privacy", "/login", "/api/jobs/run", "/d/test/trailers"]) {
    const response = await request.get(path);
    const headers = response.headers();
    expect(headers["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("microphone=(self), display-capture=(self)");
    expect(headers["content-security-policy"]).toBeUndefined();
    const policy = headers["content-security-policy-report-only"];
    expect(policy).toContain("'strict-dynamic'");
    expect(headers["cache-control"]).toContain("no-store");
    const nonce = /'nonce-([^']+)'/u.exec(policy)?.[1];
    expect(nonce).toBeTruthy();
    expect(nonces.has(nonce!)).toBe(false);
    nonces.add(nonce!);
    observed[path] = { status: response.status(), headers: Object.fromEntries(Object.entries(headers).filter(([key]) => ["strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "content-security-policy-report-only", "cache-control"].includes(key))) };
  }
  mkdirSync("docs/verification/browser-meeting-recording", { recursive: true });
  writeFileSync("docs/verification/browser-meeting-recording/local-headers.json", JSON.stringify(observed, null, 2));
});

test("dynamic login HTML receives the request nonce; static public CSP violations remain observable", async ({ page }) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { cspViolations: violations });
    document.addEventListener("securitypolicyviolation", (event) => { violations.push(`${event.effectiveDirective}:${event.disposition}`); });
  });
  const response = await page.goto("/login");
  const policy = response!.headers()["content-security-policy-report-only"];
  const nonce = /'nonce-([^']+)'/u.exec(policy)![1];
  const scriptNonces = await page.locator("script").evaluateAll((scripts) => scripts.map((script) => script.nonce));
  expect(scriptNonces.length).toBeGreaterThan(0);
  expect(scriptNonces.every((value) => value === nonce)).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const login = await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations);
  expect(login).toEqual([]);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const publicPage = await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations);
  mkdirSync("docs/verification/browser-meeting-recording", { recursive: true });
  writeFileSync("docs/verification/browser-meeting-recording/local-csp-observation.json", JSON.stringify({ login, publicPage, enforcement: false, note: "Static PRD landing has no request nonce. Resolve rendering contract before CSP enforcement; this is not a V14 pass." }, null, 2));
});
