import { expect, test } from "@playwright/test";

const endpoint = "/api/d/dept/reviews/review";
function fixture(reason: string | null) {
  return {
    review: { id: "review", dept_id: "dept", kind: "document", title: "보관 문서", filename: "file.txt",
      original_layout: "single_file", status: "failed", status_reason: reason, revision: 1, duration: null,
      sections: [], published_source_id: null, published_revision: null, original_deleted_at: null,
      candidate_sections: null },
    parts: [{ id: "part", part_index: 0, status: "waiting", start_seconds: null, end_seconds: null }],
    history: [], segments: [], original_download_allowed: false, original_expires_at: null,
  };
}

test("abandoned upload shows a reason and safe next actions", async ({ page }) => {
  await page.route(`**${endpoint}`, route => route.fulfill({ json: fixture("upload_timeout") }));
  await page.goto("/");
  await expect(page.getByText("파일 업로드가 24시간 안에 끝나지 않았습니다.")).toBeVisible();
  await expect(page.getByText(/원본이 없다면 이 자료를 삭제하고 다시 올려 주세요/)).toBeVisible();
  await expect(page.getByRole("button", { name: "실패·미처리 구간 재시도" })).toBeVisible();
  await expect(page.getByText("처리 중", { exact: true })).toHaveCount(0);
});

test("unrelated failure does not show upload timeout guidance", async ({ page }) => {
  await page.route(`**${endpoint}`, route => route.fulfill({ json: fixture("transcription_failed") }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "보관 문서" })).toBeVisible();
  await expect(page.getByText("파일 업로드가 24시간 안에 끝나지 않았습니다.")).toHaveCount(0);
});
