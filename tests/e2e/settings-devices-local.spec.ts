import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

test.skip(
  process.env.E2E_REVIEW_LIVE !== "1" || baseURL !== "http://localhost:3011" ||
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(supabaseUrl),
  "격리 로컬 QA 환경에서만 실행합니다.",
);

async function signIn(context: BrowserContext, email: string, password: string) {
  const client = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error || !result.data.session) throw result.error ?? new Error("local_login_failed");
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const encoded = Buffer.from(JSON.stringify(result.data.session), "utf8").toString("base64url");
  await context.addCookies([{
    name: `sb-${projectRef}-auth-token`, value: `base64-${encoded}`,
    url: baseURL, httpOnly: true, secure: false, sameSite: "Lax",
  }]);
  return client;
}

async function linkDevice(email: string, password: string, dept: string, deviceName: string) {
  const client = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const linked = await client.rpc("link_device", {
    p_dept: dept,
    p_device_name: deviceName,
    p_app_version: "0.1.0",
  });
  expect(linked.error).toBeNull();
}

test("내 기기만 보고 한 기기를 해제할 수 있다", async ({ browser, context, page }) => {
  test.setTimeout(90_000);
  const { dept } = JSON.parse(readFileSync(".vercel/review-qa/ids.json", "utf8")) as { dept: string };
  const { password } = JSON.parse(readFileSync(".vercel/review-qa/credentials.json", "utf8")) as { password: string };
  const service = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const names = ["기기 목록 QA 하나", "기기 목록 QA 둘", "다른 사람 기기 QA"];
  await service.from("device_links").delete().in("device_name", names);

  await signIn(context, "review-lead@example.test", password);
  const otherContext = await browser.newContext();
  try {
    const other = await signIn(otherContext, "review-member@example.test", password);
    await Promise.all(names.slice(0, 2).map((deviceName) =>
      linkDevice("review-lead@example.test", password, dept, deviceName),
    ));
    const otherLinked = await other.rpc("link_device", { p_dept: dept, p_device_name: names[2], p_app_version: "0.1.0" });
    expect(otherLinked.error).toBeNull();

    await page.goto(`${baseURL}/d/${dept}/settings`);
    await expect(page.getByRole("heading", { name: "연결된 기기" })).toBeVisible();
    await expect(page.getByText(names[0], { exact: true })).toBeVisible();
    await expect(page.getByText(names[1], { exact: true })).toBeVisible();
    await expect(page.getByText(names[2], { exact: true })).toHaveCount(0);
    await page.screenshot({ path: "docs/verification/43-desktop-companion/web-devices-1440.png", fullPage: true });
    const firstDevice = page.getByText(names[0], { exact: true }).locator("xpath=../..");
    await firstDevice.getByRole("button", { name: "연결 해제하기" }).click();
    await expect(page.getByText("이 기기를 해제할까요?")).toBeVisible();
    await page.getByRole("button", { name: "해제", exact: true }).click();
    await expect(page.getByText("이 기기는 다음 요청부터 로그아웃돼요.")).toBeVisible();
    await expect(page.getByText(names[0], { exact: true })).toHaveCount(0);
    await expect(page.getByText(names[1], { exact: true })).toBeVisible();
    await expect(page.locator("body").evaluate((body) =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).resolves.toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("body").evaluate((body) =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).resolves.toBe(true);
    await page.screenshot({ path: "docs/verification/43-desktop-companion/web-devices-390.png", fullPage: true });
  } finally {
    await service.from("device_links").delete().in("device_name", names);
    await otherContext.close();
  }
});
