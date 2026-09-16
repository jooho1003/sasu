import { expect, test, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

import {
  DEMO_DEFAULT_DEPT_ID,
  DEMO_FEATURES,
  DEMO_REVIEWER_ID,
} from "../../lib/demo-access";

loadEnvConfig(process.cwd());

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function reviewerAccessToken(context: BrowserContext): Promise<string> {
  const authCookies = (await context.cookies())
    .filter((cookie) => /-auth-token(?:\.\d+)?$/u.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  expect(authCookies.length).toBeGreaterThan(0);
  expect(authCookies.every((cookie) => cookie.httpOnly)).toBe(true);
  const encoded = authCookies.map((cookie) => cookie.value).join("");
  const json = encoded.startsWith("base64-")
    ? Buffer.from(encoded.slice("base64-".length), "base64url").toString("utf8")
    : encoded;
  const session = JSON.parse(json) as { access_token?: string; user?: { id?: string } };
  expect(session.user?.id).toBe(DEMO_REVIEWER_ID);
  expect(session.access_token).toBeTruthy();
  return session.access_token!;
}

test("공개 링크가 심사위원 계정으로 연결되고 전체 기능을 연다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/demo");
  await expect(page.getByText("심사위원 데모 계정으로 접속했습니다")).toBeVisible();
  await expect(page.locator(".demo-feature-grid > li")).toHaveCount(DEMO_FEATURES.length);

  for (const feature of DEMO_FEATURES) {
    const response = await page.goto(feature.href);
    expect(response?.status(), feature.title).toBe(200);
    await expect(page.getByRole("main")).toBeVisible();
  }
});

test("심사 계정의 앱 요청과 직접 DB 변경을 모두 거부한다", async ({ page, context }) => {
  await page.goto("/demo");
  await expect(page.getByText("심사위원 데모 계정으로 접속했습니다")).toBeVisible();

  const appWrite = await context.request.post(
    `/api/d/${DEMO_DEFAULT_DEPT_ID}/questions`,
    { data: { question: "데모 변경 차단 확인" } },
  );
  expect(appWrite.status()).toBe(403);
  expect(await appWrite.json()).toMatchObject({ code: "demo_read_only" });

  const token = await reviewerAccessToken(context);
  const db = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const directWrite = await db.rpc("admin_create_department", {
    p_name: `차단 확인 ${crypto.randomUUID().slice(0, 8)}`,
  });
  expect(directWrite.data).toBeNull();
  expect(directWrite.error?.code).toBe("42501");
  expect(directWrite.error?.message).toContain("demo_read_only");
});

test("390px에서도 기능 지도와 추천 시작점이 잘리지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "전체 기능을 순서대로 확인하세요" })).toBeVisible();
  await expect(page.getByRole("link", { name: /추천 시연 시작/u })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});
