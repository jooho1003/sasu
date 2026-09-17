import { expect, test } from "@playwright/test";

const dept = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const base = `/demo/d/${dept}`;
test.setTimeout(90_000);
test.use({ actionTimeout: 20_000 });

test("로그인 없는 부서 메뉴와 기능 지도가 화면을 벗어나지 않는다", async ({ page, context }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const writes: string[] = [];
  page.on("request", request => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url()); });
  await page.goto(base);
  await expect(page.getByRole("heading", { name: "오늘, 함께 살펴볼 결정." })).toBeVisible();
  await page.getByRole("button", { name: "메뉴 접기" }).click();
  await expect(page.locator("#workspace-sidebar")).toBeHidden();
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await page.getByRole("navigation", { name: "게스트 데모 진행 단계" }).getByRole("link", { name: "근거 확인" }).click();
  await expect(page).toHaveURL(/\/cards\//);
  await expect(page.getByRole("heading", { name: "근거 인용" })).toBeVisible();
  for (const [label, suffix] of [["묻기", "ask"], ["원장", "ledger"], ["음성·자료 검토", "reviews"], ["문서", "documents"], ["문서 평가", "roles"], ["기록 보존", "retention"], ["세팅", "settings"], ["예고편", "trailers"]]) {
    await page.getByRole("navigation", { name: "부서 메뉴", exact: true }).getByRole("link", { name: label, exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`${base}/${suffix}$`));
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  }
  await page.getByRole("link", { name: "기능 지도로" }).click();
  await expect(page.getByRole("heading", { name: "전체 기능 지도", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /문서 어시스턴트/ })).toHaveAttribute("href", `${base}/documents`);
  expect((await context.cookies()).filter(cookie => cookie.name.includes("auth-token"))).toHaveLength(0);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("자유 질문과 샘플 음성 전사가 근거 답변으로 이어진다", async ({ page }) => {
  await page.goto(`${base}/ask`);
  await page.getByLabel("데모 질문").fill("외주사 b견적은?");
  await page.getByRole("button", { name: "가까운 근거 답변 보기" }).click();
  await expect(page.locator("#demo-answer")).toBeFocused();
  await expect(page.locator("#demo-answer h2")).toContainText(/외주사|견적/);
  await expect(page.locator("#demo-answer .citation-block").first()).toBeVisible();
  await page.getByRole("button", { name: "음성 질문 동작 보기" }).click();
  await expect(page.getByText("샘플 음성 입력 중 · 실제 녹음 아님")).toBeVisible();
  await page.getByRole("button", { name: "녹음 끝내기 체험" }).click();
  await expect(page.getByText(/샘플 전사 완료/)).toBeVisible();
  await expect(page.getByLabel("데모 질문")).not.toHaveValue("");
  await page.getByRole("button", { name: "가까운 근거 답변 보기" }).click();
  await expect(page.locator("#demo-answer .citation-block").first()).toBeVisible();
  await page.getByLabel("데모 질문").fill("남극 펭귄 날씨");
  await page.getByRole("button", { name: "가까운 근거 답변 보기" }).click();
  await expect(page.locator("#demo-answer")).toContainText("답을 찾지 못했습니다");
});

test("문서별 다수 결정과 보류 후속 결정이 원장에 이어진다", async ({ page }) => {
  await page.goto(`${base}/documents?source=sales-meeting-1`);
  await expect(page.locator(".demo-source > summary")).toContainText("4개 결정");
  await page.getByRole("button", { name: "보류 안건 다시 결정" }).first().click();
  await page.getByLabel("결정 내용", { exact: true }).fill("분할 납품 합의 후 계약을 확정합니다.");
  await page.getByLabel("결정 이유", { exact: true }).fill("고객이 1차 납기와 잔여 수량에 동의했습니다.");
  await page.getByRole("button", { name: "원장에 반영", exact: true }).click();
  await expect(page.getByText("보류 이력 · 후속 결정 완료")).toBeVisible();
  await page.getByRole("link", { name: "이 문서의 결정 원장 보기" }).click();
  await expect(page).toHaveURL(/\/ledger\?source=sales-meeting-1/);
  await expect(page.getByRole("heading", { name: "분할 납품 합의 후 계약을 확정합니다." })).toBeVisible();
  await page.screenshot({ path: "docs/verification/demo-workspace/ledger-desktop.png", fullPage: true });
  await page.reload();
  await expect(page.getByRole("heading", { name: "분할 납품 합의 후 계약을 확정합니다." })).toHaveCount(0);
});

test("모바일에서 메뉴와 기록 선택을 조작한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/documents?source=sales-meeting-1`);
  await page.getByRole("button", { name: "메뉴 접기" }).click();
  await expect(page.locator("#workspace-sidebar")).toBeHidden();
  await page.getByLabel("문서·회의 선택").selectOption("sales-meeting-2");
  await expect(page.locator(".demo-source > summary")).toContainText("18일");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "docs/verification/demo-workspace/documents-mobile.png", fullPage: true });
  await page.goto(`${base}/ledger`);
  await expect(page.getByLabel("판단 근거 선택")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("모든 공개 부서의 좌측 메뉴가 해당 부서 안에서 열린다", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/demo?demo=public");
  const departments = await page.locator(".department-grid .department-card").evaluateAll(links => links.map(link => link.getAttribute("href")!));
  expect(departments.length).toBeGreaterThanOrEqual(4);
  for (const department of departments) {
    for (const suffix of ["", "/documents", "/ledger", "/ask", "/reviews", "/roles", "/retention", "/settings", "/trailers"]) {
      const response = await page.goto(`${department}${suffix}`);
      expect(response?.status(), `${department}${suffix}`).toBe(200);
      await expect(page).toHaveURL(`${new URL(page.url()).origin}${department}${suffix}`);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expect(page.getByText("합성 데이터를 불러오지 못했습니다")).toHaveCount(0);
    }
  }
});

test("자료 검토·세팅·보존·예고편을 직접 조작한다", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", request => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url()); });
  await page.goto(`${base}/reviews`);
  await page.getByRole("button", { name: "추천 예시 바로 불러오기" }).click();
  await page.getByRole("button", { name: "전사·추출 결과 보기" }).click();
  await page.getByLabel("합성 전사 검토").fill("합성 회의 원문을 확인하고 계약 재검토 근거를 확정합니다.");
  await page.getByRole("button", { name: "이 내용으로 근거 확정 체험" }).click();
  await expect(page.getByText("근거 확정 미리보기 완료")).toBeVisible();
  await page.goto(`${base}/settings`);
  await page.getByRole("checkbox").uncheck();
  await expect(page.getByRole("button", { name: "채널 연결 체험", exact: true })).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "채널 연결 체험", exact: true }).click();
  await expect(page.getByText("합성 채널 연결됨")).toBeVisible();
  await page.getByLabel("공개 범위").selectOption("leads_only");
  await page.getByRole("button", { name: "설정 저장 체험" }).click();
  await expect(page.getByRole("status")).toContainText("부서장만");
  await page.goto(`${base}/retention`);
  await page.getByLabel("보존 기간").selectOption("30");
  await page.getByRole("button", { name: "보존 정책 적용 체험" }).click();
  await expect(page.getByRole("status")).toContainText("30일 보존");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "합성 기록 내보내기" }).click();
  expect((await download).suggestedFilename()).toBe("sasu-synthetic-records.json");
  await page.goto(`${base}/trailers`);
  await page.getByRole("button", { name: "오피스 입장하기" }).click();
  await page.getByRole("button", { name: "목록형 모드로 전환" }).click();
  await page.getByRole("navigation", { name: "오피스 장소", exact: true }).getByRole("button", { name: /서고/ }).click();
  await expect(page.getByRole("region", { name: "장소 상세" })).toContainText("단서 수첩에 담았어요");
  await page.getByRole("button", { name: "닫고 오피스로 돌아가기" }).click();
  await page.getByRole("navigation", { name: "오피스 장소", exact: true }).getByRole("button", { name: /팀장실/ }).click();
  const detail = page.getByRole("region", { name: "장소 상세" });
  await detail.getByRole("checkbox").first().check();
  await detail.getByRole("radio").first().check();
  await detail.getByLabel("결정 이유").fill("합성 기록의 계약 원칙에 따라 대안 견적을 비교합니다.");
  await detail.getByRole("button", { name: "결정하고 기록실 열기" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "기록실", exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});
