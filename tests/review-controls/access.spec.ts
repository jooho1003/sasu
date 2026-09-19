import { expect, test, type Page } from "@playwright/test";
import { encodeMonoWav } from "../../lib/adapters/review-audio";
const endpoint = "/api/d/dept/reviews/review";
function fixture(kind = "audio", allowed = false, expired = false) {
  return {
    review: { id: "review", dept_id: "dept", kind, title: "합성 검토 자료", filename: kind === "audio" ? "fixture.wav" : "fixture.txt", status: "ready", revision: 1,
      sections: [{ id: "s1", text: "원본 기한 후에도 남는 교정문", original_text: "원본 기한 후에도 남는 교정문", origin: kind === "audio" ? "transcribed" : "extracted", edited: false, location: null, start_seconds: kind === "audio" ? 0 : null, end_seconds: 1 }],
      duration: kind === "audio" ? 1 : null, published_source_id: "source", published_revision: 1, original_deleted_at: null, candidate_sections: null },
    parts: [{ id: "part", part_index: 0, status: "done", start_seconds: 0, end_seconds: 1 }], history: [],
    original_download_allowed: allowed, original_expires_at: expired ? "2020-01-01T00:00:00Z" : null,
  };
}
async function mount(page: Page, state: ReturnType<typeof fixture>) {
  await page.route(`**${endpoint}`, route => route.fulfill({ json: state }));
  await page.goto("/");
  await expect(page.getByLabel("구간 1 텍스트")).toBeVisible();
}
test("다운로드 off 문서는 원본 열기 숨김, 전사·재추출은 유지", async ({ page }) => {
  await mount(page, fixture("document"));
  await expect(page.getByRole("button", { name: "원본 열기", exact: true })).toHaveCount(0);
  await expect(page.getByText("조직에서 원본 내려받기를 허용하지 않았습니다")).toBeVisible();
  await expect(page.getByRole("button", { name: "원본 다시 읽기" })).toBeEnabled();
});
test("만료된 원본은 재생·재추출·재시도 차단, 저장 전 편집 보존", async ({ page }) => {
  const state = fixture("audio", false, true);
  await mount(page, state);
  await expect(page.getByRole("button", { name: "원본 듣기", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "원본 다시 읽기" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "0:00부터 듣기" })).toBeDisabled();
  await page.getByLabel("구간 1 텍스트").fill("전사는 계속 편집 가능");
  await expect(page.getByRole("button", { name: "초안 저장" })).toBeEnabled();
});
for (const width of [390, 1440]) test(`음성 재생은 단일 세션 API를 사용하고 내려받기 버튼 숨김 ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let requests = 0;
  await page.route(`**${endpoint}/original?*`, route => {
    expect(new URL(route.request().url()).searchParams.get("action")).toBe("play_original"); requests++;
    return route.fulfill({ contentType: "audio/wav", body: Buffer.from(encodeMonoWav(new Float32Array(16000), 16000)) });
  });
  await mount(page, fixture());
  await page.getByRole("button", { name: "원본 듣기", exact: true }).click();
  const audio = page.locator("audio");
  await expect(audio).toHaveAttribute("src", /^blob:/);
  await expect(audio).toHaveAttribute("controlslist", "nodownload");
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.duration)).toBe(1);
  expect(requests).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `docs/verification/browser-meeting-recording/access-playback-${width}.png`, fullPage: true });
});
test("61회 제한 응답을 표시하고 다시 시도할 수 있다", async ({ page }) => {
  await page.route(`**${endpoint}/original?*`, route => route.fulfill({ status: 429, json: { error: "원본 요청이 많습니다. 1분 후 다시 시도해 주세요." } }));
  await mount(page, fixture());
  await page.getByRole("button", { name: "원본 듣기", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("1분 후");
  await expect(page.getByRole("button", { name: "원본 듣기", exact: true })).toBeEnabled();
});
test("보존 기한 도달 시 재생 버퍼를 폐기하고 재추출 비활성", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-18T00:00:00Z") });
  const state = fixture(); state.original_expires_at = "2026-09-18T00:00:10Z";
  await mount(page, state);
  await expect(page.getByRole("button", { name: "원본 다시 읽기" })).toBeEnabled();
  await page.clock.fastForward(11000);
  await expect(page.getByRole("button", { name: "원본 다시 읽기" })).toBeDisabled();
});
test("조직 보호 설정 저장과 실패 메시지, 읽기 전용 차단", async ({ page }) => {
  let fail = false;
  await page.route("**/api/admin/review-settings", async route => {
    expect(route.request().postDataJSON()).toEqual({ browser_recording_enabled: false, allow_original_download: true });
    await route.fulfill({ status: fail ? 500 : 200, json: { ok: !fail } });
  });
  await page.goto("/?view=settings");
  await page.getByRole("checkbox", { name: "원본 파일 내려받기 허용" }).check();
  await page.getByRole("button", { name: "원본 보호 설정 저장" }).click();
  await expect(page.getByRole("status")).toContainText("저장했습니다");
  fail = true;
  await page.getByRole("button", { name: "원본 보호 설정 저장" }).click();
  await expect(page.getByRole("alert")).toContainText("저장하지 못했습니다");
  await page.goto("/?view=settings&readonly=1");
  await expect(page.getByRole("button", { name: "원본 보호 설정 저장" })).toBeDisabled();
});
test("원본 보존 기간 선택은 Slack 보존값과 별도 요청", async ({ page }) => {
  let days: number | null = null;
  await page.route("**/api/d/dept/retention", route => route.fulfill({ json: { sources: [], settings: { plan: "paid", expires_at: null, retention_days: 365, review_original_days: days }, risk: { message: "합성 설정" } } }));
  await page.route("**/api/d/dept/retention/originals", async route => {
    expect(route.request().postDataJSON()).toEqual({ days: 30 }); days = 30;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/?view=retention");
  await page.getByLabel("확정 후 원본 보존 기간").selectOption("30");
  await page.getByRole("button", { name: "원본 보존 기간 저장" }).click();
  await expect(page.getByRole("status")).toContainText("원본 보존 기간을 저장");
  await expect(page.getByLabel("확정 후 원본 보존 기간")).toHaveValue("30");
});
