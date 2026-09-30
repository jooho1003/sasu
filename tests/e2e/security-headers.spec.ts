import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const enforcing = process.env.SASU_CSP_ENFORCE === "true";
const mode = enforcing ? "enforce" : "report-only";
const header = enforcing ? "content-security-policy" : "content-security-policy-report-only";
const otherHeader = enforcing ? "content-security-policy-report-only" : "content-security-policy";
const evidence = "docs/verification/csp-rendering-2026-09-24";
const publicPages = ["/", "/privacy", "/login", "/demo/hiring", "/demo/notion", "/no-membership", "/csp-page-that-does-not-exist"];

test("security headers and distinct request nonces cover public pages and error responses", async ({ request }) => {
  test.setTimeout(120_000);
  const observed: Record<string, unknown> = {};
  const nonces = new Set<string>();
  for (const path of [...publicPages, "/api/jobs/run", "/d/test/trailers"]) {
    const response = await request.get(path);
    const headers = response.headers();
    expect(headers["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("microphone=(self), display-capture=(self)");
    expect(headers[otherHeader]).toBeUndefined();
    expect(headers[header]).toContain("'strict-dynamic'");
    expect(headers["cache-control"]).toContain("no-store");
    const nonce = /'nonce-([^']+)'/u.exec(headers[header])?.[1];
    expect(nonce).toBeTruthy();
    expect(nonces.has(nonce!)).toBe(false);
    nonces.add(nonce!);
    observed[path] = { status: response.status(), headers: Object.fromEntries(Object.entries(headers).filter(([key]) => ["strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", header, "cache-control"].includes(key))) };
  }
  mkdirSync(evidence, { recursive: true });
  writeFileSync(`${evidence}/${mode}-headers.json`, JSON.stringify(observed, null, 2));
});

test("public, demo and not-found HTML receive matching nonces with zero normal-flow violations", async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.name));
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { cspViolations: violations });
    document.addEventListener("securitypolicyviolation", event => violations.push(`${event.effectiveDirective}:${event.disposition}`));
  });
  const observations: Record<string, unknown> = {};
  for (const path of publicPages) {
    const response = await page.goto(path);
    const nonce = /'nonce-([^']+)'/u.exec(response!.headers()[header])![1];
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const scripts = await page.locator("script").evaluateAll(elements => elements.map(element => element.nonce));
    expect(scripts.length, path).toBeGreaterThan(0);
    expect(scripts.every(value => value === nonce), path).toBe(true);
    if (path === "/demo/hiring") {
      await page.getByRole("button", { name: "합성 미션 시작", exact: true }).click();
      await page.getByRole("button", { name: "결과 제출 (데모)", exact: true }).click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("세 작업 단계");
      await page.getByRole("button", { name: "합성 샘플로 채우기", exact: true }).click();
      await page.getByRole("button", { name: "결과 제출 (데모)", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("채용팀에는 전송되지 않았습니다");
    }
    const violations = await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations);
    expect(violations, path).toEqual([]);
    observations[path] = { status: response!.status(), scripts: scripts.length, matched: true, violations };
  }
  await page.goto("/");
  await page.locator('a[href="/privacy"]:visible').first().click();
  await expect(page).toHaveURL(/\/privacy$/u);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const navigationViolations = await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations);
  expect(navigationViolations).toEqual([]);
  expect(pageErrors).toEqual([]);
  mkdirSync(evidence, { recursive: true });
  writeFileSync(`${evidence}/${mode}-browser.json`, JSON.stringify({ observations, navigationViolations, pageErrors }, null, 2));
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: `${evidence}/${mode}-privacy-390.png`, fullPage: true });
});

test("nonce-free inline code is blocked only in enforcement mode", async ({ page }) => {
  const dispositions: string[] = [];
  await page.exposeFunction("observeProbeCsp", (value: string) => dispositions.push(value));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", event => {
      if (event.effectiveDirective !== "script-src-elem") return;
      const observe = Reflect.get(window, "observeProbeCsp") as (value: string) => Promise<void>;
      void observe(event.disposition);
    });
  });
  // Let the HTML parser run the probe. CDP evaluate can bypass CSP checks.
  await page.route("**/privacy", async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace("</body>", "<script>window.sasuCspProbeExecuted = true</script></body>");
    await route.fulfill({ response, body });
  });
  await page.goto("/privacy");
  await expect.poll(() => dispositions).toEqual([enforcing ? "enforce" : "report"]);
  const result = { disposition: dispositions[0], executed: await page.evaluate(() => Reflect.get(window, "sasuCspProbeExecuted") === true) };
  expect(result).toEqual({ disposition: enforcing ? "enforce" : "report", executed: !enforcing });
  mkdirSync(evidence, { recursive: true });
  writeFileSync(`${evidence}/${mode}-injection.json`, JSON.stringify({ ...result, intentionalViolation: true }, null, 2));
});

test("Blob audio and a storage worker remain available under CSP", async ({ page }) => {
  await page.goto("/privacy");
  const result = await page.evaluate(async () => {
    const violations: string[] = [];
    const listener = (event: SecurityPolicyViolationEvent) => violations.push(`${event.effectiveDirective}:${event.disposition}`);
    document.addEventListener("securitypolicyviolation", listener);
    const workerUrl = URL.createObjectURL(new Blob(["self.onmessage = ({ data }) => self.postMessage(data + 1)"], { type: "text/javascript" }));
    const worker = new Worker(workerUrl, { type: "module" });
    const audio = document.createElement("audio");
    const bytes = new ArrayBuffer(44 + 32000), view = new DataView(bytes);
    const ascii = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    ascii(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true); ascii(8, "WAVEfmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    ascii(36, "data"); view.setUint32(40, 32000, true);
    const audioUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
    try {
      const workerValue = await new Promise<number>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("worker_timeout")), 5000);
        worker.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
        worker.onerror = () => { clearTimeout(timeout); reject(new Error("worker_failed")); };
        worker.postMessage(41);
      });
      const duration = await new Promise<number>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("audio_timeout")), 5000);
        audio.onloadedmetadata = () => { clearTimeout(timeout); resolve(audio.duration); };
        audio.onerror = () => { clearTimeout(timeout); reject(new Error("audio_failed")); };
        audio.src = audioUrl;
      });
      return { workerValue, duration, violations };
    } finally {
      worker.terminate(); audio.removeAttribute("src"); audio.load();
      URL.revokeObjectURL(workerUrl); URL.revokeObjectURL(audioUrl);
      document.removeEventListener("securitypolicyviolation", listener);
    }
  });
  expect(result).toEqual({ workerValue: 42, duration: 1, violations: [] });
});
