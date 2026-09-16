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
test.skip(
  process.env.E2E_ALLOW_SHOWCASE_WRITES !== "1",
  "공유 파일럿 부서 쓰기는 기본 차단됩니다. 전체 쓰기 검증은 scripts/review-qa.mjs의 격리 DB에서 실행하세요.",
);

type CardRow = {
  id: string;
  title: string;
  recommendation: string | null;
};

type MeetingRow = {
  source_id: string;
};

type ClassificationRow = {
  label: string;
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

function syntheticAgenda(eventId: string): {
  code: string;
  slackMessage: string;
  transcriptMessage: string;
} {
  const code = eventId.replace("e2e-", "").slice(-8).toUpperCase();
  return {
    code,
    slackMessage: `[합성 QA 테스트 — 실제 업무 아님] 합성 품목 QA-${code} 월 구독 증액 38만원을 오늘 승인할까요?`,
    transcriptMessage: `[합성 QA 테스트 — 실제 업무 아님] 합성 품목 QA-${code} 월 구독 증액 38만원 안건은 오늘까지 보류입니다. 승인 여부를 결정해주세요.`,
  };
}

async function waitForOpenCard(
  supabase: SupabaseClient,
  itemId: string,
): Promise<CardRow> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const result = await supabase
      .from("decision_requests")
      .select("id, title, recommendation")
      .eq("origin_item_id", itemId)
      .eq("status", "open")
      .maybeSingle<CardRow>();
    if (result.error) throw result.error;
    if (result.data) return result.data;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  const mergedResult = await supabase
    .from("citations")
    .select("owner_id")
    .eq("owner_kind", "decision_request")
    .eq("item_id", itemId)
    .maybeSingle<{ owner_id: string }>();
  if (mergedResult.error) throw mergedResult.error;
  throw new Error(
    `card was not created for item_id=${itemId}; merged_into=${mergedResult.data?.owner_id ?? "none"}`,
  );
}

async function rejectCard(supabase: SupabaseClient, cardId: string): Promise<void> {
  const result = await supabase.rpc("decide_request", {
    p_request: cardId,
    p_action: "reject",
    p_outcome: "",
    p_rationale: "합성 E2E 테스트 정리",
  });
  if (result.error) throw result.error;
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
  const agenda = syntheticAgenda(eventId);
  const slackTimestamp = `${Math.floor(Date.now() / 1_000)}.${Math.floor(
    Math.random() * 1_000_000,
  )
    .toString()
    .padStart(6, "0")}`;
  const message = agenda.slackMessage;
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

  const resolvedCard = await waitForOpenCard(supabase, itemId);

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
  await page.waitForLoadState("networkidle");
  await expect(page.locator("q").filter({ hasText: message })).toBeVisible();
  await expect(
    page.locator(`a[href*="slack.com/archives/${PUBLIC_CHANNEL_ID}"]`),
  ).toBeVisible();

  const rationale = "예산을 반영해 이번 안으로 진행합니다.";
  const outcome = resolvedCard.recommendation ?? resolvedCard.title;
  const completedText = page.getByText("결정 완료", { exact: true });
  await expect(async () => {
    if (await completedText.isVisible()) return;

    await page.getByLabel("결정 사유").fill(rationale);
    await page.getByRole("button", { name: "결정", exact: true }).click();
    await expect(completedText).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });

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

test("슬랙 질문과 회의 보류가 카드 1장으로 병합된다", async ({
  context,
  page,
  request,
}) => {
  test.skip(process.env.E2E_ALLOW_EXTERNAL_WRITES !== "1", "실제 DB 쓰기·워커·Slack 발송을 포함하므로 승인된 테스트 환경에서 E2E_ALLOW_EXTERNAL_WRITES=1로 실행합니다.");
  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const { supabase } = await signInLead(context, baseURL);
  const eventId = `e2e-${crypto.randomUUID()}`;
  const agenda = syntheticAgenda(eventId);
  const slackTimestamp = `${Math.floor(Date.now() / 1_000)}.${Math.floor(
    Math.random() * 1_000_000,
  )
    .toString()
    .padStart(6, "0")}`;
  const envelope = {
    type: "event_callback",
    event_id: eventId,
    event: {
      type: "message",
      channel: PUBLIC_CHANNEL_ID,
      user: "seed-member",
      text: agenda.slackMessage,
      ts: slackTimestamp,
    },
  };

  await postSlackEvent(request, baseURL, envelope);
  await runWorker(request, baseURL);

  const slackItemResult = await supabase
    .from("items")
    .select("id")
    .eq("external_ref", slackTimestamp)
    .maybeSingle<{ id: string }>();
  if (slackItemResult.error || !slackItemResult.data) {
    throw slackItemResult.error ?? new Error("slack test item was not created");
  }
  const slackItemId = slackItemResult.data.id;
  const card = await waitForOpenCard(supabase, slackItemId);
  try {
    const transcript = [
      "WEBVTT",
      "",
      "00:00:01.000 --> 00:00:08.000",
      `사수 파일럿 팀장: ${agenda.transcriptMessage}`,
    ].join("\n");
    const upload = await page.request.post(
      `${baseURL}/api/d/${DEPARTMENT_ID}/meetings/transcript`,
      {
        multipart: {
          title: `합성 QA 회의 ${agenda.code}`,
          file: {
            name: `synthetic-merge-${agenda.code}.vtt`,
            mimeType: "text/vtt",
            buffer: Buffer.from(transcript, "utf8"),
          },
        },
      },
    );
    expect(upload.status()).toBe(202);
    const uploadBody = (await upload.json()) as { meeting_id: string };

    const meetingResult = await supabase
      .from("meetings")
      .select("source_id")
      .eq("id", uploadBody.meeting_id)
      .maybeSingle<MeetingRow>();
    if (meetingResult.error || !meetingResult.data) {
      throw meetingResult.error ?? new Error("uploaded meeting was not created");
    }
    const meetingItemResult = await supabase
      .from("items")
      .select("id")
      .eq("source_id", meetingResult.data.source_id)
      .maybeSingle<{ id: string }>();
    if (meetingItemResult.error || !meetingItemResult.data) {
      throw meetingItemResult.error ?? new Error("uploaded transcript item was not created");
    }
    const meetingItemId = meetingItemResult.data.id;

    await runWorker(request, baseURL);
    await expect.poll(async () => {
      const result = await supabase
        .from("classifications")
        .select("label")
        .eq("item_id", meetingItemId)
        .maybeSingle<ClassificationRow>();
      if (result.error) throw result.error;
      return result.data?.label ?? "";
    }, { timeout: 60_000, intervals: [500, 1_000, 2_000] }).toBe("decision");

    await runWorker(request, baseURL);
    await expect.poll(async () => {
      const result = await supabase
        .from("citations")
        .select("item_id")
        .eq("owner_kind", "decision_request")
        .eq("owner_id", card.id);
      if (result.error) throw result.error;
      const itemIds = new Set((result.data ?? []).map((citation) => citation.item_id));
      return itemIds.has(slackItemId) && itemIds.has(meetingItemId);
    }, { timeout: 60_000, intervals: [500, 1_000, 2_000] }).toBe(true);

    const mergedCardCitations = await supabase
      .from("citations")
      .select("item_id")
      .eq("owner_kind", "decision_request")
      .eq("owner_id", card.id);
    expect(mergedCardCitations.error).toBeNull();
    const citedItemIds = new Set((mergedCardCitations.data ?? []).map((citation) => citation.item_id));
    expect(citedItemIds.has(slackItemId)).toBe(true);
    expect(citedItemIds.has(meetingItemId)).toBe(true);

    const newCardResult = await supabase
      .from("decision_requests")
      .select("id")
      .eq("origin_item_id", meetingItemId)
      .maybeSingle<{ id: string }>();
    expect(newCardResult.error).toBeNull();
    expect(newCardResult.data).toBeNull();

    await page.goto(`${baseURL}/d/${DEPARTMENT_ID}/cards/${card.id}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("q").filter({ hasText: agenda.slackMessage })).toBeVisible();
    await expect(page.locator("q").filter({ hasText: agenda.transcriptMessage })).toBeVisible();
  } finally {
    await rejectCard(supabase, card.id);
  }
});
