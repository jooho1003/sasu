import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type APIRequestContext } from "@playwright/test";

for (const envFile of [".env", ".env.local"]) {
  if (existsSync(envFile)) {
    loadEnvFile(envFile);
  }
}

const DEPARTMENT_ID = "22222222-2222-4222-8222-222222222222";
const PUBLIC_CHANNEL_ID = "seed-public-channel";

test.beforeEach(async ({ context }) => {
  const trustedSourceToken = process.env.VERCEL_OIDC_TOKEN?.trim();
  if (trustedSourceToken) {
    await context.setExtraHTTPHeaders({
      "x-vercel-trusted-oidc-idp-token": trustedSourceToken,
    });
  }
});

test.setTimeout(120_000);

type CardRow = {
  id: string;
  title: string;
  recommendation: string | null;
};

type DuplicateResponse = {
  duplicate?: boolean;
  message?: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function signInLead(
  context: BrowserContext,
  baseURL: string,
): Promise<{ session: Session; supabase: SupabaseClient }> {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const signIn = await supabase.auth.signInWithPassword({
    email: requiredEnv("SEED_LEAD_EMAIL"),
    password: requiredEnv("SEED_LEAD_PASSWORD"),
  });

  if (signIn.error || !signIn.data.session) {
    throw signIn.error ?? new Error("seed lead session was not created");
  }

  const session = signIn.data.session;
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  await context.addCookies([
    {
      name: `sb-${projectRef}-auth-token`,
      value: `base64-${base64Url(JSON.stringify(session))}`,
      url: new URL(baseURL).origin,
      httpOnly: true,
      secure: baseURL.startsWith("https://"),
      sameSite: "Lax",
    },
  ]);

  return {
    session,
    supabase: createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
    }),
  };
}

function slackSignature(rawBody: string, timestamp: string): string {
  const digest = createHmac("sha256", requiredEnv("SLACK_SIGNING_SECRET"))
    .update(`v0:${timestamp}:${rawBody}`, "utf8")
    .digest("hex");
  return `v0=${digest}`;
}

async function postSlackEvent(
  request: APIRequestContext,
  baseURL: string,
  envelope: Record<string, unknown>,
): Promise<void> {
  const rawBody = JSON.stringify(envelope);
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const response = await request.post(`${baseURL}/api/slack/events`, {
    data: rawBody,
    headers: {
      "content-type": "application/json",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": slackSignature(rawBody, timestamp),
    },
  });

  expect(response.status()).toBe(200);
}

async function runWorker(
  request: APIRequestContext,
  baseURL: string,
): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await request.post(`${baseURL}/api/jobs/run`, {
      headers: { "x-jobs-secret": requiredEnv("JOBS_TRIGGER_SECRET") },
    });
    expect(response.status()).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

test("실제 Slack 이벤트가 분류·카드·결정·원장까지 한 번만 흐른다", async ({
  context,
  page,
  request,
}) => {
  test.skip(process.env.E2E_ALLOW_EXTERNAL_WRITES !== "1", "실제 DB 쓰기·워커·Slack 발송을 포함하므로 승인된 테스트 환경에서 E2E_ALLOW_EXTERNAL_WRITES=1로 실행합니다.");
  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const { supabase } = await signInLead(context, baseURL);
  const eventId = `e2e-${crypto.randomUUID()}`;
  const slackTimestamp = `${Math.floor(Date.now() / 1_000)}.${Math.floor(
    Math.random() * 1_000_000,
  )
    .toString()
    .padStart(6, "0")}`;
  const message = `[합성 QA 테스트 — 실제 업무 아님] 외주사 B 견적 12% 인상 건, 오늘까지 결정해야 할까요? [${eventId}]`;
  const envelope = {
    type: "event_callback",
    event_id: eventId,
    event: {
      type: "message",
      channel: PUBLIC_CHANNEL_ID,
      user: "seed-member",
      text: message,
      ts: slackTimestamp,
    },
  };

  await postSlackEvent(request, baseURL, envelope);
  await runWorker(request, baseURL);

  await page.goto(`${baseURL}/d/${DEPARTMENT_ID}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("tab", { name: "결정 필요" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText(message, { exact: true }).first()).toBeVisible({
    timeout: 60_000,
  });

  let itemId = "";
  await expect
    .poll(
      async () => {
        const result = await supabase
          .from("items")
          .select("id")
          .eq("external_ref", slackTimestamp)
          .maybeSingle<{ id: string }>();
        if (result.error) throw result.error;
        itemId = result.data?.id ?? "";
        return itemId;
      },
      { timeout: 60_000, intervals: [500, 1_000, 2_000] },
    )
    .not.toBe("");

  await runWorker(request, baseURL);

  let card: CardRow | null = null;
  await expect
    .poll(
      async () => {
        const result = await supabase
          .from("decision_requests")
          .select("id, title, recommendation")
          .eq("origin_item_id", itemId)
          .eq("status", "open")
          .maybeSingle<CardRow>();
        if (result.error) throw result.error;
        card = result.data;
        return card?.id ?? "";
      },
      { timeout: 60_000, intervals: [500, 1_000, 2_000] },
    )
    .not.toBe("");

  if (!card) {
    throw new Error("card was not created");
  }
  const resolvedCard = card as CardRow;

  await expect.poll(async () => {
    const delivery = await supabase.from("decision_requests")
      .select("slack_delivery_status, slack_message_ts")
      .eq("id", resolvedCard.id).single();
    if (delivery.error) throw delivery.error;
    return delivery.data.slack_delivery_status === "sent" && Boolean(delivery.data.slack_message_ts);
  }, { timeout: 30_000 }).toBe(true);

  await page.goto(`${baseURL}/d/${DEPARTMENT_ID}/cards/${resolvedCard.id}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("q").filter({ hasText: message })).toBeVisible();
  await expect(
    page.locator(`a[href*="slack.com/archives/${PUBLIC_CHANNEL_ID}"]`),
  ).toBeVisible();

  const rationale = "예산을 반영해 이번 안으로 진행합니다.";
  const outcome = resolvedCard.recommendation ?? resolvedCard.title;
  await page.getByLabel("결정 사유").fill(rationale);
  await page.getByRole("button", { name: "결정", exact: true }).click();
  await expect(page.getByText("결정 완료", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  const duplicateResult = await page.evaluate(
    async ({ cardId, decisionOutcome, decisionRationale }) => {
      const response = await fetch(`/api/cards/${cardId}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "decided",
          outcome: decisionOutcome,
          rationale: decisionRationale,
        }),
      });
      return {
        status: response.status,
        body: (await response.json()) as DuplicateResponse,
      };
    },
    {
      cardId: resolvedCard.id,
      decisionOutcome: outcome,
      decisionRationale: rationale,
    },
  );
  expect(duplicateResult.status).toBe(200);
  expect(duplicateResult.body.duplicate).toBe(true);
  expect(duplicateResult.body.message).toContain("이미");

  const decisions = await supabase
    .from("decisions")
    .select("id", { count: "exact", head: true })
    .eq("request_id", resolvedCard.id);
  expect(decisions.error).toBeNull();
  expect(decisions.count).toBe(1);

  await page.goto(`${baseURL}/d/${DEPARTMENT_ID}/ledger`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText(rationale, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("리드타임", { exact: true }).first()).toBeVisible();

  await postSlackEvent(request, baseURL, envelope);
  const items = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("external_ref", slackTimestamp);
  expect(items.error).toBeNull();
  expect(items.count).toBe(1);
});
