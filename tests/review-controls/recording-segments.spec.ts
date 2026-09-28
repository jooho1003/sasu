import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { encodeMonoWav } from "../../lib/adapters/review-audio";

const endpoint = "/api/d/dept/reviews/review";
function fixture(status = "done", downloadAllowed = false, twoSegments = false) {
  return {
    review: { id: "review", dept_id: "dept", kind: "audio", title: "합성 회의", filename: "fixture.wav",
      original_layout: "audio_segments", status: "ready", revision: 1, duration: twoSegments ? 61 : 2,
      sections: [{ id: "s1", text: "합성 발언", original_text: "합성 발언", origin: "transcribed",
        edited: false, location: null, start_seconds: 0, end_seconds: 2 }],
      published_source_id: null, published_revision: null, original_deleted_at: null, candidate_sections: null },
    parts: [{ id: "part", part_index: 0, status, start_seconds: 0, end_seconds: 2 }],
    segments: twoSegments ? [{ index: 0, status: "verified" }, { index: 1, status: "verified" }] : [{ index: 0, status: "verified" }],
    history: [], original_download_allowed: downloadAllowed,
    original_expires_at: null,
  };
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
