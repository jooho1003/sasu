import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { hiringMissions } from "../../fixtures/hiring/missions";
import { serviceClient } from "./support/auth";

const evidence = "docs/verification/department-hiring-demo";
test.beforeAll(() => mkdirSync(evidence, { recursive: true }));
test.setTimeout(90_000);

for (const width of [1440, 390]) for (const mission of hiringMissions) {
  test(`${mission.team} ${width}px: 직접 기록·근거·결과 제출·무전송`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes: string[] = [], leakedInputs: string[] = [], errors: string[] = [];
    page.on("request", request => {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(new URL(request.url()).pathname);
      if (`${request.url()}${request.postData() ?? ""}`.includes("DEMO_ONLY_INPUT_7c9a")) leakedInputs.push(request.method());
    });
    page.on("pageerror", error => errors.push(error.name));
    await page.goto("/demo/hiring");
    await page.getByRole("button", { name: new RegExp(`^${mission.team}`) }).click();
    await expect(page.getByRole("heading", { name: mission.title })).toBeVisible();
    await page.getByRole("button", { name: "합성 미션 시작", exact: true }).click();
    await page.getByRole("button", { name: "결과 제출 (데모)", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("세 작업 단계");
    for (const stage of mission.stages) {
      await page.getByLabel(stage.label, { exact: true }).fill(`${stage.label}: DEMO_ONLY_INPUT_7c9a 합성 자료를 확인하고 선택 이유와 검증할 항목을 정리했습니다.`);
      await page.getByRole("button", { name: `${stage.label} 기록하기`, exact: true }).click();
    }
    await page.getByLabel(`${mission.facts[0].label}를 판단 근거로 선택`, { exact: true }).check();
    await page.getByLabel("판단 근거와 남은 한계", { exact: true }).fill(mission.sample.approach);
    await page.getByLabel("산출물 · 문서/코드/화면 설계 설명", { exact: true }).fill(mission.sample.artifact);
    await page.getByRole("button", { name: "결과 제출 (데모)", exact: true }).click();
    await expect(page.getByRole("region", { name: "제출 결과" })).toContainText(mission.sample.approach);
    await expect(page.getByRole("status")).toContainText("채용팀에는 전송되지 않았습니다");
    await expect(page.getByRole("progressbar", { name: "기록한 작업 단계" })).toHaveAttribute("value", "3");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${evidence}/${mission.id}-${width}.png`, fullPage: true });
    expect(writes).toEqual([]); expect(leakedInputs).toEqual([]); expect(errors).toEqual([]);
    // Next dev's debugger opens its own DB; it is not application persistence.
    expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: (await indexedDB.databases()).filter(database => database.name !== "__next_debug_channel").map(database => database.name) }))).toEqual({ local: 0, session: 0, databases: [] });
  });
}

test("부서 간 진행 격리·샘플 표시·첨부 형식·코드 비실행·초기화", async ({ page }) => {
  await page.goto("/demo/hiring");
  await page.getByRole("button", { name: "합성 미션 시작", exact: true }).click();
  await page.getByRole("button", { name: "합성 샘플로 채우기", exact: true }).click();
  await page.getByLabel("합성 산출물 파일 선택", { exact: false }).setInputFiles({ name: "run.exe", mimeType: "application/octet-stream", buffer: Buffer.from("not executable") });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("허용된");
  await page.getByLabel("합성 산출물 파일 선택", { exact: false }).setInputFiles({ name: "sample.md", mimeType: "text/markdown", buffer: Buffer.from("합성 산출물입니다.") });
  await page.getByLabel("산출물 · 문서/코드/화면 설계 설명", { exact: true }).fill("<script>window.__hiringExecuted = true</script> 합성 코드이며 실행하면 안 됩니다.");
  await page.getByRole("button", { name: /^인사팀/ }).click();
  await expect(page.getByRole("button", { name: "합성 미션 시작", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^기획팀/ }).click();
  await expect(page.getByLabel("판단 근거와 남은 한계", { exact: true })).toHaveValue(hiringMissions[0].sample.approach);
  await page.getByRole("button", { name: "결과 제출 (데모)", exact: true }).click();
  await expect(page.getByRole("region", { name: "제출 결과" })).toContainText("합성 샘플을 바탕으로 작성한 제출");
  await expect(page.getByRole("region", { name: "제출 결과" })).toContainText("sample.md");
  expect(await page.evaluate(() => Reflect.get(window, "__hiringExecuted"))).toBeUndefined();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "이 부서 체험 초기화", exact: true }).click();
  await expect(page.getByRole("region", { name: "제출 결과" })).toHaveCount(0);
  await page.getByRole("button", { name: "합성 미션 시작", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "합성 미션 시작", exact: true })).toBeVisible();
});

test("키보드로 미션을 시작하고 파일만 첨부한 제출을 확인한다", async ({ page }) => {
  await page.goto("/demo/hiring");
  const start = page.getByRole("button", { name: "합성 미션 시작", exact: true });
  await start.focus(); await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "합성 샘플로 채우기", exact: true }).click();
  await page.getByLabel("산출물 · 문서/코드/화면 설계 설명", { exact: true }).fill("");
  await page.getByLabel("합성 산출물 파일 선택", { exact: false }).setInputFiles({ name: "wireframe.png", mimeType: "image/png", buffer: Buffer.from("synthetic placeholder; not decoded") });
  await page.getByRole("button", { name: "결과 제출 (데모)", exact: true }).click();
  await expect(page.getByRole("region", { name: "제출 결과" })).toContainText("wireframe.png");
});

for (const mission of hiringMissions) test(`${mission.team}: 부서 데이터·결정 카드·원장·근거 답변`, async ({ page }) => {
  test.skip(process.env.E2E_REVIEW_LIVE !== "1" || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""), "격리 로컬 데모 시드만 사용");
  const db = serviceClient();
  async function counts() {
    const entries = await Promise.all(["items", "decisions", "answers", "jobs", "llm_calls"].map(async table => {
      const result = await db.from(table).select("*", { count: "exact", head: true });
      expect(result.error).toBeNull(); return [table, result.count];
    }));
    return Object.fromEntries(entries);
  }
  const before = await counts();
  const writes: string[] = [];
  page.on("request", request => { if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(request.method()); });
  expect((await page.goto(`/demo/d/${mission.deptId}`))?.status()).toBe(200);
  const card = page.locator('a[href*="/cards/"]:visible').first();
  await expect(card).toBeVisible(); await card.click();
  await expect(page.locator("q").first()).toBeVisible();
  await page.getByRole("link", { name: "결정 기록", exact: true }).click();
  await page.waitForURL(`**/demo/d/${mission.deptId}/ledger`, { timeout: 45_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("결정 기록");
  const source = page.locator(".demo-source").first();
  await source.locator(":scope > summary").click();
  await source.locator(".demo-source-originals > summary").click();
  await expect(source.locator("q").first()).toBeVisible();
  await page.getByRole("link", { name: "묻기", exact: true }).click();
  await page.waitForURL(`**/demo/d/${mission.deptId}/ask`, { timeout: 45_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("묻기");
  expect(await page.locator("q").count()).toBeGreaterThan(0);
  await page.screenshot({ path: `${evidence}/${mission.id}-workspace.png`, fullPage: true });
  expect(await counts()).toEqual(before);
  expect(writes).toEqual([]);
});
