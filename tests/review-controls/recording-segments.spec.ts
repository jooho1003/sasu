import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { encodeMonoWav } from "../../lib/adapters/review-audio";

const endpoint = "/api/d/dept/reviews/review";
function fixture(status = "done", downloadAllowed = false, twoSegments = false) {
  return {
    review: { id: "review", dept_id: "dept", kind: "audio", title: "합성 회의", filename: "fixture.wav",
      original_layout: "audio_segments", status: "ready", revision: 1, duration: twoSegments ? 61 : 2,
      sections: [{ id: "s1", text: "합성 발언", original_text: "합성 발언", origin: "transcribed",
        edited: false, location: null, start_seconds: 0, end_seconds: 2,
        confidence: null as "normal" | "low" | null, boundary_review: false }],
      published_source_id: null, published_revision: null, original_deleted_at: null, candidate_sections: null },
    parts: [{ id: "part", part_index: 0, status, start_seconds: 0, end_seconds: 2 }],
    segments: twoSegments ? [{ index: 0, status: "verified" }, { index: 1, status: "verified" }] : [{ index: 0, status: "verified" }],
    history: [], original_download_allowed: downloadAllowed,
    original_expires_at: null,
  };
}

function threeSegmentFixture() {
  const state = fixture();
  state.review.duration = 150;
  state.segments = [0, 1, 2].map((index) => ({ index, status: "verified" }));
  return state;
}

async function mountThreeSegments(page: import("@playwright/test").Page, requests: number[]) {
  const full = Buffer.from(encodeMonoWav(new Float32Array(960_000), 16000));
  const tail = Buffer.from(encodeMonoWav(new Float32Array(480_000), 16000));
  await page.route(`**${endpoint}/original?*`, route => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get("action")).toBe("play_original");
    const index = Number(params.get("segment"));
    requests.push(index);
    return route.fulfill({ contentType: "audio/wav", body: index === 2 ? tail : full });
  });
  await page.route(`**${endpoint}`, route => route.fulfill({ json: threeSegmentFixture() }));
  await page.goto("/");
  await expect(page.getByRole("slider", { name: "녹음 시각" })).toBeVisible();
}

test("verified original plays by segment number and seeks from a transcript section", async ({ page }) => {
  const requests: number[] = [];
  await page.route(`**${endpoint}/original?*`, route => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get("action")).toBe("play_original");
    requests.push(Number(params.get("segment")));
    return route.fulfill({ contentType: "audio/wav", body: Buffer.from(encodeMonoWav(new Float32Array(32000), 16000)) });
  });
  await page.route(`**${endpoint}`, route => route.fulfill({ json: fixture() }));
  await page.goto("/");
  await expect(page.getByLabel("구간 1 텍스트")).toBeVisible();
  await page.getByRole("button", { name: "원본 듣기", exact: true }).click();
  await expect(page.getByRole("button", { name: "듣기 잠시 멈추기" })).toBeVisible();
  expect(requests).toEqual([0]);
  await page.getByRole("button", { name: "0:00부터 듣기" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests).toEqual([0, 0]);
  await expect(page.locator("audio")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "전체 녹음 WAV 내려받기" })).toHaveCount(0);
});

test("low-confidence and boundary sections are highlighted and visited before confirmation", async ({ page }) => {
  const state = fixture();
  state.review.sections.push(
    { ...state.review.sections[0], id: "s2", text: "확인할 발언", original_text: "확인할 발언",
      confidence: "low", start_seconds: 2, end_seconds: 3 },
    { ...state.review.sections[0], id: "s3", text: "경계 발언", original_text: "경계 발언",
      boundary_review: true, start_seconds: 60, end_seconds: 61 },
  );
  await page.route(`**${endpoint}`, route => route.fulfill({ json: state }));
  await page.goto("/");
  await expect(page.getByText("낮은 신뢰")).toBeVisible();
  await expect(page.getByText("경계 확인 필요")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /전문과 빠짐·오류를 확인했습니다/ })).toBeDisabled();
  await page.getByLabel("본문 검색").fill("합성 발언");
  await page.getByRole("button", { name: "다음 확인 필요 구간" }).click();
  await expect(page.getByLabel("본문 검색")).toHaveValue("");
  await expect(page.getByLabel("구간 2 텍스트")).toBeFocused();
  await expect(page.getByText("확인 필요 1/2 구간 확인")).toBeVisible();
  await page.getByRole("button", { name: "다음 확인 필요 구간" }).click();
  await expect(page.getByLabel("구간 3 텍스트")).toBeFocused();
  await expect(page.getByText("확인 필요 2/2 구간 확인")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /전문과 빠짐·오류를 확인했습니다/ })).toBeEnabled();
});

test("citation link focuses its transcript section without requesting audio before playback", async ({ page }) => {
  const state = fixture();
  state.review.sections.push({ ...state.review.sections[0], id: "s2", text: "인용한 발언", original_text: "인용한 발언", start_seconds: 61, end_seconds: 62 });
  let originalRequests = 0;
  await page.route(`**${endpoint}/original?*`, route => { originalRequests++; return route.abort(); });
  await page.route(`**${endpoint}`, route => route.fulfill({ json: state }));
  await page.goto("/?section=1");
  await expect(page.getByRole("button", { name: "1:01부터 듣기" })).toBeFocused();
  expect(originalRequests).toBe(0);
});

test("download setting gates a sequential two-segment WAV export", async ({ page }) => {
  const actions: string[] = [];
  await page.route(`**${endpoint}/original?*`, route => {
    const params = new URL(route.request().url()).searchParams;
    actions.push(`${params.get("action")}:${params.get("segment")}`);
    const samples = params.get("segment") === "0" ? 960_000 : 16_000;
    return route.fulfill({ contentType: "application/octet-stream", body: Buffer.from(encodeMonoWav(new Float32Array(samples), 16000)) });
  });
  await page.route(`**${endpoint}`, route => route.fulfill({ json: fixture("done", true, true) }));
  await page.goto("/");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "전체 녹음 음성 파일 내려받기" }).click();
  const download = await pending;
  const bytes = await readFile((await download.path())!);
  expect(download.suggestedFilename()).toBe("meeting-recording.wav");
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(bytes.length).toBe(44 + 976_000 * 2);
  expect(actions).toEqual(["download_original:0", "download_original:1"]);
});

test("segment transcription retry queues the server path without legacy parts upload", async ({ page }) => {
  let queued = 0;
  let original = 0;
  await page.route(`**${endpoint}/original?*`, route => { original++; return route.abort(); });
  await page.route(`**${endpoint}/parts`, route => { queued++; return route.fulfill({ status: 202, json: { job_id: "job" } }); });
  await page.route(`**${endpoint}`, route => route.fulfill({ json: fixture("waiting") }));
  await page.goto("/");
  await page.getByRole("button", { name: "실패·미처리 구간 재시도" }).click();
  await expect.poll(() => queued).toBe(1);
  expect(original).toBe(0);
});

test("pointer drag requests no original until release and at most two afterward", async ({ page }) => {
  const requests: number[] = [];
  await mountThreeSegments(page, requests);
  await page.getByRole("button", { name: "원본 듣기", exact: true }).click();
  await expect(page.getByRole("button", { name: "듣기 잠시 멈추기" })).toBeVisible();
  requests.length = 0;
  const slider = page.getByRole("slider", { name: "녹음 시각" });
  const box = await slider.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 10, box!.y + box!.height / 2);
  await page.mouse.down();
  for (const fraction of [0.3, 0.5, 0.7]) await page.mouse.move(box!.x + box!.width * fraction, box!.y + box!.height / 2, { steps: 4 });
  expect(requests).toHaveLength(0);
  await page.mouse.up();
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(requests.length).toBeLessThanOrEqual(2);
  await expect(page.getByText(/원본 요청이 많습니다/)).toHaveCount(0);
});

test("ten quick keyboard seeks commit once after 300ms", async ({ page }) => {
  const requests: number[] = [];
  await mountThreeSegments(page, requests);
  await page.getByRole("button", { name: "원본 듣기", exact: true }).click();
  await expect(page.getByRole("button", { name: "듣기 잠시 멈추기" })).toBeVisible();
  requests.length = 0;
  const slider = page.getByRole("slider", { name: "녹음 시각" });
  await slider.focus();
  for (let index = 0; index < 10; index++) await page.keyboard.press("ArrowRight");
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(requests.length).toBeLessThanOrEqual(2);
});

test("player shows total duration and readable slider position at desktop and mobile widths", async ({ page }) => {
  await page.route(`**${endpoint}`, route => route.fulfill({ json: threeSegmentFixture() }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const slider = page.getByRole("slider", { name: "녹음 시각" });
  await expect(slider).toHaveAttribute("aria-valuetext", "0분 0초 / 전체 2분 30초");
  await expect(page.getByText("0:00 / 2:30")).toBeVisible();
  await page.screenshot({ path: "docs/verification/recording-ux-2026-09-29/s4-player-1440.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: "docs/verification/recording-ux-2026-09-29/s4-player-390.png", fullPage: true });
});

test("clipping warning uses a warning style without a live region", async ({ page }) => {
  const high = fixture();
  await page.route(`**${endpoint}`, route => route.fulfill({ json: {
    ...high,
    review: { ...high.review, capture_metadata: { clipping_ratio: 0.1 } },
  } }));
  await page.goto("/");
  const warning = page.getByText("입력이 과했습니다. 원본을 들으며 받아쓴 글을 확인해 주세요.");
  await expect(warning).toBeVisible();
  await expect(warning).toHaveClass(/review-warning/);
  await expect(warning).not.toHaveAttribute("role", "status");

  await page.unroute(`**${endpoint}`);
  await page.route(`**${endpoint}`, route => route.fulfill({ json: {
    ...high,
    review: { ...high.review, capture_metadata: { clipping_ratio: 0.01 } },
  } }));
  await page.reload();
  await expect(warning).toHaveCount(0);
});

test("continued meeting navigation is a compact row at desktop and mobile widths", async ({ page }) => {
  const state = fixture();
  await page.route(`**${endpoint}`, route => route.fulfill({ json: {
    ...state,
    review: { ...state.review, capture_metadata: { clipping_ratio: 0.1 } },
    continuation: { previous: { id: "previous-review", title: "앞 회의" }, next: null },
    can_continue: true,
  } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "이어진 회의 기록" });
  await expect(navigation.getByRole("link", { name: "← 이전 기록 · 앞 회의" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "이 회의 이어서 녹음" })).toBeVisible();
  await expect(page.locator('section[aria-label="이어진 회의 기록"]')).toHaveCount(0);
  await page.screenshot({ path: "docs/verification/recording-ux-2026-09-29/s6-review-detail-1440.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: "docs/verification/recording-ux-2026-09-29/s6-review-detail-390.png", fullPage: true });
});
