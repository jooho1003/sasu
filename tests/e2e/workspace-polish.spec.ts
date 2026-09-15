import { expect, test, type Page } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { missingEnv, SEED_LEAD, signInSeedUser } from "./support/auth";

loadEnvConfig(process.cwd());
const dept = "22222222-2222-4222-8222-222222222222";
const base = `/d/${dept}`;
const documentApi = `**/api/d/${dept}/documents`;
const settingsApi = `**/api/d/${dept}/settings`;
const apiDocument = {
  id: "fixture-doc-1",
  title: "영업 정책 안내",
  visibility: "dept",
  status: "summarized",
  status_reason: null,
  extracted_chars: 200,
  chunk_count: 2,
  created_at: "2026-09-15T00:00:00.000Z",
  summary: {
    overview: "정책 변경은 담당자 확인 후 공지합니다.",
    key_points: [{ item_id: "fixture-item-1", text: "담당자 확인 후 공지" }],
    decisions: [],
    actions: [],
    open_questions: [],
    citations: [
      {
        item_id: "fixture-item-1",
        decision_id: null,
        quote: "담당자 확인 후 공지합니다.",
      },
    ],
  },
};
const settings = {
  current_user_id: "fixture-lead",
  role: "lead",
  channels_available: true,
  members: [
    {
      user_id: "fixture-lead",
      display_name: "김사수",
      role: "lead",
      slack_user_id: "U1",
      consented_at: "2026-09-15T00:00:00Z",
    },
    {
      user_id: "fixture-member",
      display_name: "이동료",
      role: "member",
      slack_user_id: "U2",
      consented_at: null,
    },
  ],
  sources: [
    {
      id: "fixture-source",
      kind: "notion_page",
      external_id: "page-1",
      title: "영업 원칙",
      visibility: "dept",
      active: true,
      last_synced_at: null,
      last_error: null,
    },
  ],
  channels: [
    { id: "C1", name: "영업", isPrivate: false },
    { id: "C2", name: "기획", isPrivate: false },
  ],
  slack_users: [
    { id: "U1", displayName: "김사수" },
    { id: "U2", displayName: "이동료" },
  ],
};
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test.describe("후속 UI · API 응답 고정 · 외부 업무 데이터 쓰기 없음", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    test.skip(
      missingEnv([
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "SEED_LEAD_EMAIL",
        "SEED_LEAD_PASSWORD",
      ]).length > 0,
      "읽기 전용 시드 로그인 필요",
    );
    await signInSeedUser(context, baseURL!, SEED_LEAD);
  });

  for (const width of [1440, 390]) {
    test(`문서 선택·검색·인용·파일 선택 ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      let reads = 0;
      const writes: string[] = [];
      await page.route(documentApi, async (route) => {
        if (route.request().method() !== "GET") {
          writes.push(route.request().method());
          await route.abort();
          return;
        }
        reads++;
        await route.fulfill({
          json: {
            documents: [
              apiDocument,
              {
                ...apiDocument,
                id: "fixture-doc-2",
                title: "개발 업무 원칙",
                summary: { ...apiDocument.summary, citations: [] },
              },
            ],
          },
        });
      });
      await page.goto(`${base}/documents`);
      await expect(page.locator("#document-detail h3")).toHaveText(
        "영업 정책 안내",
      );
      await expect(page.locator("#document-detail q")).toHaveText(
        "담당자 확인 후 공지합니다.",
      );
      await page.screenshot({
        path: info.outputPath(`fixture-documents-${width}.png`),
        fullPage: true,
      });
      await page
        .getByRole("group", { name: "문서 선택" })
        .getByRole("button", { name: /개발 업무 원칙/ })
        .click();
      await expect(
        page.getByText(
          "확인 가능한 원문 근거가 없어 요약을 표시할 수 없습니다.",
        ),
      ).toBeVisible();
      await expect(page.locator("#document-detail q")).toHaveCount(0);
      await expect(page.locator("#document-detail")).not.toContainText(
        apiDocument.summary.overview,
      );
      await page
        .getByRole("searchbox", { name: "문서 이름 검색" })
        .fill("없는 문서");
      await expect(
        page.getByText("검색한 이름의 문서가 없습니다."),
      ).toBeVisible();
      await page.getByRole("button", { name: "검색 초기화" }).click();
      await page
        .getByRole("button", { name: "문서 추가", exact: true })
        .click();
      await page.getByLabel("문서 파일").setInputFiles({
        name: "확인.exe",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("fixture"),
      });
      await expect(page.locator("main").getByRole("alert")).toContainText(
        "20MB 이하",
      );
      await expect(
        page.getByRole("button", { name: "문서 정리 시작" }),
      ).toBeDisabled();
      await page.getByLabel("문서 파일").setInputFiles({
        name: "정책.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("합성 테스트 문서"),
      });
      await expect(
        page.getByRole("button", { name: "문서 정리 시작" }),
      ).toBeEnabled();
      await page.screenshot({
        path: info.outputPath(`fixture-upload-${width}.png`),
        fullPage: true,
      });
      await noOverflow(page);
      // A completed list must not continuously re-fetch as a result of its own state update.
      await page.waitForTimeout(1500);
      expect(reads).toBe(1);
      expect(writes).toEqual([]);
    });

    test(`설정 메뉴 전환·채널 선택 후 입력 보존 ${width}px`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      let reads = 0;
      await page.route(settingsApi, async (route) => {
        reads++;
        await route.fulfill({ json: settings });
      });
      await page.route(`**/api/d/${dept}/invites`, async (route) => { await route.fulfill({ json: { invites: [] } }); });
      await page.goto(`${base}/settings`);
      await expect(
        page.getByRole("heading", { name: "함께하는 멤버" }),
      ).toBeVisible();
      await page
        .getByLabel("이동료 Slack 계정", { exact: true })
        .selectOption("U1");
      await page.screenshot({
        path: info.outputPath(`fixture-settings-members-${width}.png`),
        fullPage: true,
      });
      const picker = page.getByRole("group", { name: "세팅 항목 선택" });
      await picker.getByRole("button", { name: "연결 관리" }).click();
      await expect(
        page.getByRole("heading", { name: "함께하는 멤버" }),
      ).toBeHidden();
      await expect(
        page.getByRole("button", { name: "채널 연결 및 공지 게시" }),
      ).toBeDisabled();
      const panel = page.locator("#settings-connections");
      await panel
        .getByRole("combobox", { name: "Slack 채널", exact: true })
        .selectOption("C2");
      await panel.getByLabel("표시 이름").fill("입력 중인 채널 이름");
      await page.screenshot({
        path: info.outputPath(`fixture-settings-connections-${width}.png`),
        fullPage: true,
      });
      await picker.getByRole("button", { name: "자료 가져오기" }).click();
      await expect(
        page.getByRole("heading", { name: "회의 전사 업로드" }),
      ).toBeVisible();
      await page.getByLabel("회의 이름").fill("작성 중 회의");
      await page.screenshot({
        path: info.outputPath(`fixture-settings-imports-${width}.png`),
        fullPage: true,
      });
      await picker.getByRole("button", { name: "연결 관리" }).click();
      await expect(panel.getByLabel("표시 이름")).toHaveValue(
        "입력 중인 채널 이름",
      );
      await page.getByRole("button", { name: "멤버 동의 확인" }).click();
      await expect(
        page.getByLabel("이동료 Slack 계정", { exact: true }),
      ).toHaveValue("U1");
      await noOverflow(page);
      await page.waitForTimeout(1200);
      expect(reads).toBe(1);
    });
  }

  test("문서 로딩·오류 재시도와 처리 완료 후 폴링 종료", async ({ page }) => {
    let reads = 0;
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(documentApi, async (route) => {
      reads++;
      if (reads === 1) {
        await delayed;
        await route.fulfill({ status: 503, json: {} });
      } else
        await route.fulfill({
          json: {
            documents: [
              {
                ...apiDocument,
                status: reads === 2 ? "processing" : "summarized",
              },
            ],
          },
        });
    });
    await page.goto(`${base}/documents`);
    await expect(page.getByText("문서를 불러오고 있어요")).toBeVisible();
    await expect(page.getByText("우리 부서의 지식을 모아보세요")).toHaveCount(
      0,
    );
    release();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "불러오지 못했습니다",
    );
    await page.getByRole("button", { name: "다시 불러오기" }).click();
    await expect(page.getByText("핵심과 근거를 정리하고 있어요")).toBeVisible();
    await expect(page.locator("#document-detail q")).toBeVisible({
      timeout: 10_000,
    });
    await page.waitForTimeout(4500);
    expect(reads).toBe(3);
  });

  test("설정 오류에서 다시 불러온다", async ({ page }) => {
    let reads = 0;
    await page.route(settingsApi, async (route) => {
      reads++;
      await route.fulfill(
        reads === 1
          ? { status: 503, json: { message: "연결을 확인해 주세요." } }
          : { json: settings },
      );
    });
    await page.goto(`${base}/settings`);
    await expect(
      page.getByRole("heading", { name: "세팅을 불러오지 못했습니다" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "다시 불러오기" }).click();
    await expect(
      page.getByRole("heading", { name: "함께하는 멤버" }),
    ).toBeVisible();
    expect(reads).toBe(2);
  });
});

for (const width of [1440, 390]) {
  test(`게스트 관리자 메뉴와 읽기 전용 탐색 ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const writes: string[] = [];
    page.on("request", (request) => {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method()))
        writes.push(request.method());
    });
    await page.goto("/demo/admin");
    const menu = page.getByRole("navigation", {
      name: "조직 관리",
      exact: true,
    });
    for (const [label, title] of [
      ["개요", "조직 개요"],
      ["멤버", "멤버"],
      ["수집 채널", "수집 채널"],
      ["기록", "기록"],
    ]) {
      await menu.getByRole("link", { name: label, exact: true }).click();
      await expect(
        menu.getByRole("link", { name: label, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(
        page.getByText("게스트 모드 · 합성 데이터 · 읽기 전용", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /초대|제외|철회|부서 만들기/ }),
      ).toHaveCount(0);
      expect(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(
          await page.locator("main").innerText(),
        ),
      ).toBe(false);
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath(`demo-admin-${label}-${width}.png`),
        fullPage: true,
      });
    }
    expect(writes).toEqual([]);
  });
}

for (const width of [1440, 390]) {
  test(`로그인한 조직 관리자의 읽기 탐색과 키보드 탭 ${width}px`, async ({
    context,
    page,
    baseURL,
  }, info) => {
    test.skip(
      missingEnv([
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "SEED_ORG_ADMIN_EMAIL",
        "SEED_ORG_ADMIN_PASSWORD",
      ]).length > 0,
      "조직 관리자 QA 계정 필요",
    );
    await signInSeedUser(context, baseURL!, {
      emailEnv: "SEED_ORG_ADMIN_EMAIL",
      passwordEnv: "SEED_ORG_ADMIN_PASSWORD",
    });
    await page.setViewportSize({ width, height: 1000 });
    const writes: string[] = [];
    page.on("request", (request) => {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method()))
        writes.push(request.method());
    });
    await page.goto("/admin");
    const menu = page.getByRole("navigation", {
      name: "조직 관리",
      exact: true,
    });
    for (const label of ["개요", "멤버", "수집 채널", "기록"]) {
      await menu.getByRole("link", { name: label, exact: true }).click();
      await expect(
        menu.getByRole("link", { name: label, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noOverflow(page);
      if (label === "멤버" || label === "기록") {
        const tabs = page.getByRole("tablist").getByRole("tab");
        await tabs.first().focus();
        await page.keyboard.press("ArrowRight");
        await expect(tabs.last()).toBeFocused();
        await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
        await page.keyboard.press("Home");
        await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
      }
      await page.screenshot({
        path: info.outputPath(`qa-admin-${label}-${width}.png`),
        fullPage: true,
      });
    }
    expect(writes).toEqual([]);
  });
}
