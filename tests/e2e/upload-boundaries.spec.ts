import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIResponse } from "@playwright/test";

import { SEED_LEAD, SEED_MEMBER, missingEnv, requiredEnv, serviceClient, signInSeedUser } from "./support/auth";

for (const envFile of [".env", ".env.local"]) {
  if (existsSync(envFile)) loadEnvFile(envFile);
}

// ADR-042 · PRD §11 "보안 핫픽스" 행: 문서·전사 업로드는 서버 어댑터가 마스킹 후 insert한다.
// 운영 Supabase에 쓰고 워커가 분류·요약 LLM을 부르므로 승인된 실행(E2E_ALLOW_EXTERNAL_WRITES=1)에서만 돈다.
// 로그·실패 메시지에는 id·행 수·HTTP 상태만 남기고 업로드 본문은 남기지 않는다.

const DEPARTMENT_ID = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const PUBLIC_SOURCE_ID = "33333333-3333-4333-8333-333333333333";
const NON_MEMBER_SPEAKER = "외부 참석자";

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  SEED_LEAD.emailEnv,
  SEED_LEAD.passwordEnv,
  SEED_MEMBER.emailEnv,
  SEED_MEMBER.passwordEnv,
] as const;

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const FAKE_EMAIL = `sasu-e2e-${runId}@example.com`;
const FAKE_PHONE = "010-0000-0000";
const createdSourceIds: string[] = [];
const createdReviewIds: string[] = [];

function baseUrl(): string {
  return process.env.E2E_BASE_URL ?? "http://localhost:3000";
}

async function jsonBody(response: APIResponse): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function itemContents(sourceId: string): Promise<string[]> {
  const { data, error } = await serviceClient().from("items").select("content").eq("source_id", sourceId);
  if (error) throw new Error(`items lookup failed for source ${sourceId}`);
  return (data ?? []).map((row) => String(row.content));
}

async function itemCount(deptId: string): Promise<number> {
  const { count, error } = await serviceClient().from("items").select("id", { count: "exact", head: true }).eq("dept_id", deptId);
  if (error || count === null) throw new Error(`items count failed for dept ${deptId}`);
  return count;
}

test.describe.configure({ mode: "serial" });

test.describe("업로드 쓰기 경계 (ADR-042)", () => {
  test.skip(process.env.E2E_ALLOW_EXTERNAL_WRITES !== "1", "운영 DB 쓰기와 분류·요약 LLM 호출을 포함하므로 승인된 실행에서 E2E_ALLOW_EXTERNAL_WRITES=1로만 돈다.");
  test.skip(process.env.E2E_ALLOW_SHOWCASE_WRITES !== "1", "공유 파일럿 부서 쓰기는 기본 차단됩니다. scripts/review-qa.mjs의 격리 DB를 사용하세요.");
  test.skip(missingEnv(REQUIRED_ENV).length > 0, `필요한 env가 없다: ${missingEnv(REQUIRED_ENV).join(", ")}`);

  test.afterAll(async ({ browser }) => {
    if (createdSourceIds.length === 0 && createdReviewIds.length === 0) return;
    const context = await browser.newContext();
    try {
      await signInSeedUser(context, baseUrl(), SEED_LEAD);
      for (const reviewId of createdReviewIds) {
        await context.request.post(`${baseUrl()}/api/d/${DEPARTMENT_ID}/reviews/${reviewId}`, { data: { action: "delete", revision: 1 } });
      }
      for (const sourceId of createdSourceIds) {
        const response = await context.request.delete(`${baseUrl()}/api/d/${DEPARTMENT_ID}/settings/source?id=${sourceId}`);
        if (!response.ok()) console.warn(`cleanup failed: source=${sourceId} status=${response.status()}`);
      }
    } finally {
      await context.close();
    }
  });

  test("lead 문서 업로드는 마스킹된 본문만 items에 저장한다", async ({ browser }) => {
    const context = await browser.newContext();
    await signInSeedUser(context, baseUrl(), SEED_LEAD);
    const response = await context.request.post(`${baseUrl()}/api/d/${DEPARTMENT_ID}/documents`, {
      multipart: {
        title: `E2E 업로드 경계 ${runId}`,
        visibility: "dept",
        file: {
          name: `upload-boundary-${runId}.txt`,
          mimeType: "text/plain",
          buffer: Buffer.from(
            `합성 문서입니다. 담당 연락처는 ${FAKE_EMAIL}, 전화 ${FAKE_PHONE}입니다.\n예산 상한은 3,000만원이고 마감은 2026-10-01입니다.`,
            "utf8",
          ),
        },
      },
      maxRedirects: 0,
    });
    const body = await jsonBody(response);
    expect(response.status(), "문서 업로드 응답 상태").toBe(202);
    const reviewId = String(body.review_id ?? "");
    expect(reviewId).toMatch(/^[0-9a-f-]{36}$/u);
    createdReviewIds.push(reviewId);
    const reviewUrl = `${baseUrl()}/api/d/${DEPARTMENT_ID}/reviews/${reviewId}`;
    await expect.poll(async () => {
      const detail = await jsonBody(await context.request.get(reviewUrl));
      return (detail.review as { status?: string } | undefined)?.status;
    }, { timeout: 90_000 }).toBe("ready");
    const published = await context.request.post(reviewUrl, { data: { action: "publish", revision: 1 } });
    expect(published.ok()).toBe(true);
    const sourceId = String((await jsonBody(published)).source_id ?? "");
    expect(sourceId).toMatch(/^[0-9a-f-]{36}$/u);

    const contents = await itemContents(sourceId);
    expect(contents.length, `source=${sourceId} items`).toBeGreaterThan(0);
    const joined = contents.join("\n");
    expect(joined.includes(FAKE_EMAIL), "원문 이메일이 items에 남으면 안 된다").toBe(false);
    expect(joined.includes(FAKE_PHONE), "원문 전화번호가 items에 남으면 안 된다").toBe(false);
    expect(joined).toContain("[이메일]");
    expect(joined).toContain("[전화번호]");
    expect(joined, "금액·날짜는 마스킹하지 않는다").toContain("3,000만원");
    await context.close();
  });

  test("member 문서 업로드는 403이고 소스가 생기지 않는다", async ({ browser }) => {
    const context = await browser.newContext();
    await signInSeedUser(context, baseUrl(), SEED_MEMBER);
    const title = `E2E member 거부 ${runId}`;
    const response = await context.request.post(`${baseUrl()}/api/d/${DEPARTMENT_ID}/documents`, {
      multipart: {
        title,
        visibility: "dept",
        file: { name: `member-${runId}.txt`, mimeType: "text/plain", buffer: Buffer.from("합성 문서", "utf8") },
      },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(403);
    const { count, error } = await serviceClient().from("sources").select("id", { count: "exact", head: true }).eq("title", title);
    expect(error).toBeNull();
    expect(count).toBe(0);
    await context.close();
  });

  test("데모 부서로의 업로드는 거부되고 데모 items가 늘지 않는다", async ({ browser }) => {
    const anon = createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const demo = await anon.rpc("demo_departments");
    expect(demo.error).toBeNull();
    const demoDeptId = String((demo.data as Array<{ id: string }> | null)?.[0]?.id ?? "");
    expect(demoDeptId).toMatch(/^[0-9a-f-]{36}$/u);
    const before = await itemCount(demoDeptId);

    const context = await browser.newContext();
    await signInSeedUser(context, baseUrl(), SEED_LEAD);
    const response = await context.request.post(`${baseUrl()}/api/d/${demoDeptId}/documents`, {
      multipart: {
        title: `E2E 데모 거부 ${runId}`,
        visibility: "dept",
        file: { name: `demo-${runId}.txt`, mimeType: "text/plain", buffer: Buffer.from("합성 문서", "utf8") },
      },
      maxRedirects: 0,
    });
    // 시드 부서장은 데모 부서 멤버가 아니므로 멤버십 검사에서 리다이렉트되고, 멤버라면 데모 검사에서 403이다.
    expect([303, 307, 403, 404], `status=${response.status()}`).toContain(response.status());
    expect(await itemCount(demoDeptId)).toBe(before);
    await context.close();
  });

  test("lead 전사 업로드는 동의한 멤버 발언만 마스킹해 저장한다", async ({ browser }) => {
    const service = serviceClient();
    // 시드 팀원 이름은 환경마다 다르다(운영 파일럿·로컬 QA). 이 부서의 동의한 팀원을 찾아 화자로 쓴다.
    const consented = await service
      .from("members")
      .select("display_name")
      .eq("dept_id", DEPARTMENT_ID)
      .eq("role", "member")
      .not("consented_at", "is", null)
      .order("display_name")
      .limit(1)
      .maybeSingle<{ display_name: string }>();
    expect(consented.error).toBeNull();
    const consentedName = consented.data?.display_name.trim() ?? "";
    expect(consentedName, "동의한 팀원이 있어야 전사 케이스가 성립한다").not.toBe("");

    const vtt = [
      "WEBVTT",
      "",
      "00:00:01.000 --> 00:00:04.000",
      `${consentedName}: 합성 회의 발언입니다. 연락은 ${FAKE_EMAIL} 또는 ${FAKE_PHONE}로 주세요.`,
      "",
      "00:00:05.000 --> 00:00:08.000",
      `${NON_MEMBER_SPEAKER}: 멤버가 아닌 사람의 합성 발언 ${runId}`,
      "",
    ].join("\n");

    const context = await browser.newContext();
    await signInSeedUser(context, baseUrl(), SEED_LEAD);
    const response = await context.request.post(`${baseUrl()}/api/d/${DEPARTMENT_ID}/meetings/transcript`, {
      multipart: {
        title: `E2E 전사 경계 ${runId}`,
        visibility: "dept",
        file: { name: `transcript-${runId}.vtt`, mimeType: "text/vtt", buffer: Buffer.from(vtt, "utf8") },
      },
      maxRedirects: 0,
    });
    const body = await jsonBody(response);
    expect(response.status(), "전사 업로드 응답 상태").toBe(202);
    expect(body.accepted).toBe(1);
    expect(body.skipped).toBe(1);

    const meeting = await service
      .from("meetings")
      .select("source_id")
      .eq("id", String(body.meeting_id ?? ""))
      .maybeSingle<{ source_id: string }>();
    expect(meeting.error).toBeNull();
    const sourceId = String(meeting.data?.source_id ?? "");
    expect(sourceId).toMatch(/^[0-9a-f-]{36}$/u);
    createdSourceIds.push(sourceId);

    const contents = await itemContents(sourceId);
    expect(contents.length, `source=${sourceId} items`).toBe(1);
    expect(contents[0].includes(FAKE_EMAIL)).toBe(false);
    expect(contents[0].includes(FAKE_PHONE)).toBe(false);
    expect(contents[0]).toContain("[이메일]");
    expect(contents.join("\n").includes(runId), "멤버가 아닌 화자의 발언은 저장하지 않는다").toBe(false);
    await context.close();
  });

  test("0025 적용 후: authenticated는 items에 직접 INSERT할 수 없다", async ({ browser }) => {
    test.skip(process.env.E2E_EXPECT_0025 !== "1", "0025 적용 전에는 직접 INSERT가 실제로 들어가므로 E2E_EXPECT_0025=1에서만 확인한다.");
    const context = await browser.newContext();
    const { supabase } = await signInSeedUser(context, baseUrl(), SEED_LEAD);
    const externalRef = `e2e-direct-${runId}`;
    const insert = await supabase.from("items").insert({
      source_id: PUBLIC_SOURCE_ID,
      dept_id: DEPARTMENT_ID,
      external_ref: externalRef,
      author: "e2e",
      content: `마스킹되지 않은 합성 원문 ${FAKE_PHONE}`,
    });
    if (!insert.error) {
      await serviceClient().from("items").delete().eq("source_id", PUBLIC_SOURCE_ID).eq("external_ref", externalRef);
    }
    expect(insert.error?.code, "직접 INSERT는 권한 오류여야 한다").toBe("42501");
    await context.close();
  });

  test("0025 적용 후: member는 departments.org_id를 바꿀 수 없다", async ({ browser }) => {
    test.skip(process.env.E2E_EXPECT_0025 !== "1", "0025 적용 뒤에만 확인한다. 같은 org_id로 갱신을 시도하므로 적용 전에도 데이터는 바뀌지 않는다.");
    const context = await browser.newContext();
    const { supabase } = await signInSeedUser(context, baseUrl(), SEED_MEMBER);
    const update = await supabase.from("departments").update({ org_id: ORG_ID }).eq("id", DEPARTMENT_ID).select("id");
    expect(update.error?.code, "departments UPDATE는 권한 오류여야 한다").toBe("42501");
    await context.close();
  });
});
