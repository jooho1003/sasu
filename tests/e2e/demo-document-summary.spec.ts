import { expect, test } from "@playwright/test";

const dept = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const title = "배포 점검 회의록 (합성)";
const shots = "docs/verification/53-demo-document-summary";
test.setTimeout(120_000);
test.use({ actionTimeout: 20_000 });

for (const [name, size] of [["1440", { width: 1440, height: 1000 }], ["390", { width: 390, height: 844 }]] as const) {
  test(`데모 문서 화면에 합성 회의록 요약 구역이 보인다 (${name})`, async ({ page }) => {
    await page.setViewportSize(size);
    const writes: string[] = [];
    page.on("request", request => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url()); });
    await page.goto("/demo");
    await page.goto(`/demo/d/${dept}/documents`);

    const source = page.locator("details.demo-source", { hasText: title });
    await source.locator("summary").first().click();
    await expect(source).toHaveJSProperty("open", true);

    const overview = source.locator(".document-overview");
    await expect(overview.getByText("한눈에 보기", { exact: true })).toBeVisible();
    for (const heading of ["결정·정책", "다음 할 일", "확인이 필요한 질문"]) {
      await expect(source.locator(".summary-section h4", { hasText: heading })).toBeVisible();
    }
    await expect(source.locator(".summary-section h4", { hasText: "원문 근거" })).toBeVisible();

    const originals = await source.locator(".demo-source-originals").innerText();
    const sentences = (await overview.locator("p").nth(1).innerText()).split(/(?<=[.!?])\s+/).filter(Boolean);
    expect(sentences.length).toBe(2);
    for (const sentence of sentences) expect(originals).toContain(sentence);

    await expect(page.getByRole("button", { name: /문서 정리 시작|문서 추가|업로드/ })).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    expect(writes).toEqual([]);

    await source.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/demo-documents-${name}.png`, fullPage: true });
  });
}
