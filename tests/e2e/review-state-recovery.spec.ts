import { expect, test, type Page, type Route } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { mkdirSync } from "node:fs";
import type { ReviewedMaterial, ReviewPart, ReviewSection } from "@/lib/contracts";
import { SEED_LEAD, signInSeedUser } from "./support/auth";

loadEnvConfig(process.cwd());
test.setTimeout(60_000);
const dept = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
const endpoint = `/api/d/${dept}/reviews/${id}`;
const evidence = "docs/verification/review-state-recovery-2026-09-17";
type Detail = ReviewedMaterial & { candidate_sections: ReviewSection[] | null };

function fixture() {
  const review: Detail = {
    id, dept_id: dept, kind: "document", title: "합성 검토 자료",
    filename: "review.txt", visibility: "dept", fingerprint: "0".repeat(64),
    duration: null, file_size: 100, original_path: `${dept}/${id}/original`,
    status: "ready", status_reason: null, revision: 1,
    sections: [{ id: "section-0", text: "저장된 내용", original_text: "저장된 내용",
      origin: "extracted", edited: false, location: null, start_seconds: null, end_seconds: null }],
    published_revision: null, published_source_id: null,
    created_at: "2026-09-17T00:00:00Z", updated_at: "2026-09-17T00:00:00Z",
    confirmed_at: null, original_deleted_at: null, candidate_sections: null,
  };
  const parts: ReviewPart[] = [{ id: "part-0", part_index: 0, start_seconds: null,
    end_seconds: null, status: "done", error_code: null, attempt: 1 }];
  return { review, parts, history: [] };
}

async function open(page: Page) {
  await page.goto(`/d/${dept}/reviews/${id}`);
  await expect(page.getByLabel("구간 1 텍스트")).toBeVisible();
}

test.beforeEach(async ({ context, baseURL }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  test.skip(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url), "격리 로컬 QA 로그인 필요");
  await signInSeedUser(context, baseURL!, SEED_LEAD);
});

for (const width of [1440, 390]) {
  test(`검토 복구: 원본만 삭제해도 미저장 제목·구간이 남고 저장된다 ${width}px`, async ({ page }) => {
    const state = fixture();
    let saves = 0;
    await page.setViewportSize({ width, height: 900 });
    await page.route(`**${endpoint}`, async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        expect(request.postDataJSON()).toEqual({ action: "delete_original", revision: 1 });
        state.review.original_deleted_at = "2026-09-17T01:00:00Z";
        return route.fulfill({ json: { ok: true } });
      }
      if (request.method() === "PATCH") {
        const body = request.postDataJSON();
        expect(body).toMatchObject({ revision: 1, title: "저장 전 제목",
          sections: [{ id: "section-0", text: "저장 전 교정" }, { text: "사용자 메모" }] });
        state.review.title = body.title;
        state.review.sections = body.sections.map((s: { id: string; text: string }, index: number) => ({
          ...state.review.sections[0], ...s, origin: index ? "user" : "extracted", edited: true,
        }));
        state.review.revision = 2;
        saves++;
        return route.fulfill({ json: { revision: 2 } });
      }
      return route.fulfill({ json: state });
    });
    await open(page);
    await page.getByLabel("검토 제목").fill("저장 전 제목");
    await page.getByLabel("구간 1 텍스트").fill("저장 전 교정");
    await page.getByRole("button", { name: "텍스트 추가", exact: true }).click();
    await page.getByLabel("구간 2 텍스트").fill("사용자 메모");
    await page.getByRole("button", { name: "원본 파일만 삭제", exact: true }).click();
    await page.getByRole("button", { name: "삭제 실행", exact: true }).click();
    await expect(page.getByText("원본이 지워졌거나 보관 기한이 지났습니다", { exact: true })).toBeVisible();
    await expect(page.getByLabel("검토 제목")).toHaveValue("저장 전 제목");
    await expect(page.getByLabel("구간 1 텍스트")).toHaveValue("저장 전 교정");
    await expect(page.getByLabel("구간 2 텍스트")).toHaveValue("사용자 메모");
    await expect(page.getByRole("button", { name: "확인 후 확정", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "초안 저장", exact: true })).toBeEnabled();
    expect(saves).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: `${evidence}/draft-preserved-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "초안 저장", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("초안을 저장했습니다");
    expect(saves).toBe(1);
    await page.reload();
    await expect(page.getByLabel("구간 2 텍스트")).toHaveValue("사용자 메모");
  });
}

test("검토 복구: 다른 창의 새 버전을 조회해도 편집 기준 버전을 올리지 않는다", async ({ page }) => {
  const state = fixture();
  let saves = 0;
  await page.route(`**${endpoint}`, async (route) => {
    if (route.request().method() === "POST") {
      // Another editor saves after the original-only deletion succeeds.
      state.review.revision = 2;
      state.review.title = "다른 창의 제목";
      state.review.sections[0].text = "다른 창의 변경";
      state.review.original_deleted_at = "2026-09-17T01:00:00Z";
      return route.fulfill({ json: { ok: true } });
    }
    if (route.request().method() === "PATCH") {
      expect(route.request().postDataJSON().revision).toBe(1);
      saves++;
      return route.fulfill({ status: 409, json: { error: "다른 창에서 자료가 변경됐습니다." } });
    }
    return route.fulfill({ json: state });
  });
  await open(page);
  await page.getByLabel("구간 1 텍스트").fill("이 창의 교정");
  await page.getByRole("button", { name: "원본 파일만 삭제", exact: true }).click();
  await page.getByRole("button", { name: "삭제 실행", exact: true }).click();
  await expect(page.getByText("원본이 지워졌거나 보관 기한이 지났습니다", { exact: true })).toBeVisible();
  await expect(page.getByLabel("구간 1 텍스트")).toHaveValue("이 창의 교정");
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "다른 창에서 자료가 변경됐습니다" })).toBeVisible();
  expect(saves).toBe(1);
  await page.getByRole("button", { name: "최신 상태 확인", exact: true }).click();
  await expect(page.getByLabel("구간 1 텍스트")).toHaveValue("이 창의 교정");
  await page.getByRole("button", { name: "편집 취소", exact: true }).click();
  await expect(page.getByLabel("구간 1 텍스트")).toHaveValue("다른 창의 변경");
});

test("검토 복구: 일부 구간 실패 후에도 나머지 진행을 확인하고 종료한다", async ({ page }) => {
  const state = fixture();
  state.review.status = "failed";
  state.parts[0].status = "failed";
  state.parts[0].error_code = "timeout";
  state.parts.push({ ...state.parts[0], id: "part-1", part_index: 1, status: "processing", error_code: null });
  let gets = 0;
  await page.route(`**${endpoint}`, (route) => {
    gets++;
    if (gets > 1) state.parts[1].status = "done";
    return route.fulfill({ json: state });
  });
  await open(page);
  await page.clock.install();
  await expect(page.getByLabel("구간 1 텍스트")).toBeDisabled();
  await page.clock.fastForward(3100);
  await expect(page.getByRole("region", { name: "변환 진행" })).toContainText("1/2 구간 완료");
  await expect(page.getByLabel("구간 1 텍스트")).toBeEnabled();
  await expect(page.getByRole("button", { name: "실패·미처리 구간 재시도" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "확인 후 확정" })).toBeDisabled();
  await page.clock.fastForward(10_000);
  expect(gets).toBe(2);
});

test("검토 복구: 중단 전 조회의 늦은 응답이 편집 화면을 되돌리지 않는다", async ({ page }) => {
  const state = fixture();
  state.review.status = "processing";
  state.parts[0].status = "processing";
  let gets = 0;
  let delayed: Route | undefined;
  const oldState = structuredClone(state);
  await page.route(`**${endpoint}`, (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON().action).toBe("cancel");
      state.review.status = "cancelled";
      state.parts[0].status = "cancelled";
      return route.fulfill({ json: { ok: true } });
    }
    gets++;
    if (gets === 2) { delayed = route; return; }
    return route.fulfill({ json: state });
  });
  await open(page);
  await page.clock.install();
  await page.clock.fastForward(3100);
  await expect.poll(() => Boolean(delayed)).toBe(true);
  await page.clock.fastForward(9000);
  expect(gets).toBe(2);
  await page.getByRole("button", { name: "처리 중단", exact: true }).click();
  await expect(page.getByLabel("구간 1 텍스트")).toBeEnabled();
  await page.getByLabel("구간 1 텍스트").fill("중단 후 교정");
  const finished = page.waitForEvent("requestfinished", (request) =>
    request.url().endsWith(endpoint) && request.method() === "GET",
  );
  await delayed!.fulfill({ json: oldState });
  await finished;
  await page.clock.runFor(100);
  await expect(page.getByLabel("구간 1 텍스트")).toBeEnabled();
  await expect(page.getByLabel("구간 1 텍스트")).toHaveValue("중단 후 교정");
  await expect(page.getByRole("button", { name: "처리 중단", exact: true })).toHaveCount(0);
  await page.clock.fastForward(4000);
  expect(gets).toBe(3);
});
