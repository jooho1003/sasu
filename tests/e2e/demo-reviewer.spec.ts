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

test("각 기능 화면이 데이터를 불러온 뒤에도 오류 화면으로 바뀌지 않는다", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/demo");
  await expect(page.getByText("심사위원 데모 계정으로 접속했습니다")).toBeVisible();

  for (const feature of DEMO_FEATURES) {
    // 200 응답만으로는 클라이언트 조회 이후의 렌더 오류를 잡지 못한다.
    await page.goto(feature.href, { waitUntil: "networkidle" });
    await expect(page.getByText("합성 데이터를 불러오지 못했습니다"), feature.title).toHaveCount(0);
    if (feature.key === "documents") {
      await page.locator(".demo-source > summary").first().click();
      await expect(page.getByText("한눈에 보기").first()).toBeVisible();
      expect(await page.locator(".document-citations q").count()).toBeGreaterThan(0);
    }
  }
  expect(errors).toEqual([]);
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

test("결정·기록·질문·자료 검토를 브라우저 안에서 끝까지 체험한다", async ({ page }) => {
  await page.goto(DEMO_FEATURES.find((feature) => feature.key === "card")!.href);
  await page.getByLabel("결정 사유").fill("합성 데모에서 재입찰을 우선 검토합니다.");
  await page.getByRole("button", { name: "재입찰로 결정" }).click();
  await expect(page.getByText("결정 완료 미리보기")).toBeVisible();

  await page.goto(DEMO_FEATURES.find((feature) => feature.key === "ledger")!.href);
  await page.getByLabel("결정 내용").fill("외주사 B는 재입찰을 진행합니다.");
  await page.getByLabel("결정 이유").fill("10% 이상 인상 원칙을 적용했습니다.");
  await page.getByRole("button", { name: "원장 반영 미리보기" }).click();
  await expect(page.getByText("결정 미리보기")).toBeVisible();

  await page.goto(DEMO_FEATURES.find((feature) => feature.key === "ask")!.href);
  await page.getByPlaceholder("예: 외주사 B 견적은 어떻게 됐나요?").fill("외주사 견적은 어떻게 됐나요?");
  await page.getByRole("button", { name: "가까운 근거 답변 보기" }).click();
  await expect(page.getByText(/실제 전송 없이 가장 가까운 준비 질문/u)).toBeVisible();
  await page.getByRole("button", { name: "🎙 음성 질문 동작 보기" }).click();
  await expect(page.getByText(/마이크·음성은 서버로 전송되지 않습니다/u)).toBeVisible();

  await page.goto(DEMO_FEATURES.find((feature) => feature.key === "reviews")!.href);
  await expect(page.getByText("예시 자료 5개 포함")).toBeVisible();
  await expect(page.locator(".demo-sample-file-grid > article")).toHaveCount(5);
  await expect(page.getByRole("link", { name: "파일 보기" })).toHaveCount(5);
  const sampleLinks = await page.getByRole("link", { name: "파일 보기" }).evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  );
  for (const href of sampleLinks) {
    expect(href).toBeTruthy();
    const response = await page.request.get(href!);
    expect(response.status(), href!).toBe(200);
    expect((await response.body()).length, href!).toBeGreaterThan(50);
  }
  await page.getByRole("button", { name: "추천 예시 바로 불러오기" }).click();
  await expect(page.getByText("파일 · 온새미로-영업-주간회의.vtt")).toBeVisible();
  await expect(page.getByRole("checkbox")).toBeChecked();
  await page.getByRole("button", { name: "전사·추출 결과 보기" }).click();
  await page.getByRole("button", { name: "이 내용으로 근거 확정 체험" }).click();
  await expect(page.getByText("근거 확정 미리보기 완료")).toBeVisible();
});
