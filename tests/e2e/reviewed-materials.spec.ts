import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  SEED_LEAD,
  SEED_MEMBER,
  signInSeedUser,
  serviceClient,
} from "./support/auth";

const dept = "22222222-2222-4222-8222-222222222222";
const evidence = "docs/verification/reviewed-materials-2026-09-16";
test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_REVIEW_LIVE !== "1" ||
    !/^http:\/\/(127\.0\.0\.1|localhost):/.test(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    ),
  "격리된 로컬 Supabase와 실제 Groq에서만 실행",
);
test.beforeAll(() => mkdirSync(evidence, { recursive: true }));
async function ready(
  context: import("@playwright/test").BrowserContext,
  id: string,
  baseURL: string,
) {
  await expect
    .poll(
      async () => {
        const res = await context.request.get(
          `${baseURL}/api/d/${dept}/reviews/${id}`,
        );
        const body = await res.json();
        return body.review?.status;
      },
      { timeout: 150_000, intervals: [2000, 3000, 5000] },
    )
    .toBe("ready");
  return (
    await (
      await context.request.get(`${baseURL}/api/d/${dept}/reviews/${id}`)
    ).json()
  ).review;
}
function normalize(text: string) {
  return text.replace(/[^가-힣a-z0-9]/gi, "");
}
function distance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        next[j - 1] + 1,
        row[j] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[b.length];
}

test("한국어 TTS 전체 전사 → 원본 재생 → 편집·재접속·확정·권한·삭제", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(300_000);
  const { supabase } = await signInSeedUser(context, baseURL!, SEED_LEAD);
  await context.addCookies(
    (await context.cookies()).map((c) => ({ ...c, httpOnly: false })),
  );
  await page.goto(`/d/${dept}/reviews`);
  await page
    .getByLabel("검토할 파일")
    .setInputFiles(resolve(".vercel/review-qa/tts-review.wav"));
  await page
    .getByLabel("자료 제목", { exact: true })
    .fill("TTS 실제 연동 검증");
  await page
    .getByLabel("TTS 등 실제 사람의 발언이 아닌 합성 음성입니다")
    .check();
  await page
    .getByLabel("이 자료를 보관하고 업무에 활용할 권한이 있음을 확인했습니다.")
    .check();
  await page.getByRole("button", { name: "전체 음성 전사 시작" }).click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/, { timeout: 60_000 });
  const id = page.url().split("/").at(-1)!;
  const draft = await ready(context, id, baseURL!);
  expect(draft.published_source_id).toBeNull();
  expect(
    (
      await serviceClient()
        .from("sources")
        .select("id")
        .like("external_id", `review:${id}:%`)
    ).data,
  ).toHaveLength(0);
  const recognized = draft.sections
    .map((s: { text: string }) => s.text)
    .join(" ");
  const expected = readFileSync("tests/fixtures/review-tts.txt", "utf8");
  const phrases = [
    "합성",
    "고객안내문서",
    "월요일",
    "수요일",
    "금요일",
    "마지막부분",
    "초안",
    "검색",
    "원본음성",
    "새로고침",
    "푸른고래",
    "삼백만원",
  ];
  const normalized = normalize(recognized);
  const matching = phrases.filter((p) => normalized.includes(p));
  expect(matching.length).toBeGreaterThanOrEqual(10);
  expect(normalized).toContain("푸른고래");
  expect(normalized).toContain("종료");
  const cer =
    distance(normalize(expected), normalized) / normalize(expected).length;
  expect(cer).toBeLessThan(0.35);
  writeFileSync(
    `${evidence}/tts-results.json`,
    JSON.stringify(
      {
        synthetic: true,
        realGroq: true,
        reviewId: id,
        durationSeconds: draft.duration,
        parts: draft.sections.length,
        expectedCharacters: normalize(expected).length,
        recognizedCharacters: normalized.length,
        characterErrorRate: cer,
        matchedPhrases: matching.length,
        totalPhrases: phrases.length,
        lastPhraseMatched: normalized.includes("푸른고래"),
        draftSourceCount: 0,
      },
      null,
      2,
    ),
  );
  await page.reload();
  await expect(page.getByLabel("구간 1 텍스트")).toBeVisible();
  await page.getByRole("button", { name: "원본 듣기", exact: true }).click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.duration),
    )
    .toBeGreaterThan(80);
  await page.getByRole("button", { name: "1:00부터 듣기" }).first().click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThanOrEqual(60);
  await page.locator("audio").evaluate((a: HTMLAudioElement) => a.pause());
  await page
    .getByLabel("구간 1 텍스트")
    .fill(
      "검토자가 교정한 합성 회의입니다. 담당자는 초안을 작성하고 확인받습니다.",
    );
  await page.getByRole("button", { name: "텍스트 추가", exact: true }).click();
  const count = await page
    .getByRole("textbox", { name: /구간 \d+ 텍스트/ })
    .count();
  await page
    .getByLabel(`구간 ${count} 텍스트`)
    .fill("사용자가 추가한 점검 메모입니다.");
  await page.getByRole("button", { name: "텍스트 추가", exact: true }).click();
  await page.getByLabel(`구간 ${count + 1} 텍스트`).fill("삭제할 메모");
  await page
    .getByRole("button", { name: `구간 ${count + 1} 삭제`, exact: true })
    .click();
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("초안을 저장");
  await page.reload();
  await expect(page.getByLabel(`구간 ${count} 텍스트`)).toHaveValue(
    "사용자가 추가한 점검 메모입니다.",
  );
  await page.getByLabel(/전문과 누락·오류를 확인했습니다/).check();
  await page.getByRole("button", { name: "확인 후 확정", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("확정했습니다");
  const published = await supabase
    .from("reviewed_materials")
    .select("published_source_id,published_revision,revision")
    .eq("id", id)
    .single();
  expect(published.data?.published_revision).toBe(published.data?.revision);
  const source = published.data!.published_source_id;
  expect(
    (
      await serviceClient()
        .from("items")
        .select("content")
        .eq("source_id", source)
    ).data?.some((i) => i.content.includes("추가한 점검 메모")),
  ).toBe(true);
  await page.screenshot({
    path: `${evidence}/audio-confirmed-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `${evidence}/audio-confirmed-mobile.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const memberContext = await page.context().browser()!.newContext();
  await signInSeedUser(memberContext, baseURL!, SEED_MEMBER);
  expect(
    (
      await memberContext.request.get(`${baseURL}/api/d/${dept}/reviews/${id}`)
    ).status(),
  ).toBe(404);
  const member = (await signInSeedUser(memberContext, baseURL!, SEED_MEMBER))
    .supabase;
  expect(
    (
      await member.storage
        .from("review-materials")
        .download(`${dept}/${id}/original`)
    ).error,
  ).toBeTruthy();
  await memberContext.close();
  const download = await context.request.get(
    `${baseURL}/api/d/${dept}/reviews/${id}?format=txt`,
  );
  const exportedText = await download.text();
  expect(exportedText).toContain("사용자 추가");
  expect(exportedText).toContain(`부서: ${dept}`);
  expect(exportedText).toContain("원본: tts-review.wav");
  await page
    .getByRole("button", { name: "업무 활용 중지", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("중지했습니다");
  const late = await serviceClient().from("document_summaries").update({status:"summarized",summary:{overview:"늦게 도착한 합성 요약"}}).eq("source_id",source).select("summary,status_reason").single();
  expect(late.error).toBeNull();expect(late.data?.summary).toBeNull();expect(late.data?.status_reason).toBe("source_removed");
  expect((await supabase.from("document_summaries").select("source_id").eq("source_id",source)).data).toEqual([]);
  expect(
    (
      await serviceClient()
        .from("items")
        .select("content,deleted_at")
        .eq("source_id", source)
    ).data?.every((i) => i.content === "" && i.deleted_at),
  ).toBe(true);
  await page
    .getByRole("button", { name: "자료 전체 삭제", exact: true })
    .click();
  await page.getByRole("button", { name: "삭제 실행", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${dept}/reviews$`));
  await expect
    .poll(
      async () =>
        Boolean(
          (
            await serviceClient()
              .storage.from("review-materials")
              .download(`${dept}/${id}/original`)
          ).error,
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
});

test("문서 전문 검토·교정·재추출 충돌·다중 창 버전 충돌", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(180_000);
  await signInSeedUser(context, baseURL!, SEED_LEAD);
  await context.addCookies(
    (await context.cookies()).map((c) => ({ ...c, httpOnly: false })),
  );
  await page.goto(`/d/${dept}/reviews`);
  await page.getByRole("button", { name: "문서 파일", exact: true }).click();
  const text =
    "자료 읽기 검증\n정책: 모든 구매는 부서장 확인 후 진행합니다.\n" +
    "문서의 중간 내용입니다. ".repeat(300) +
    "\n마지막 행은 파란 연필입니다. 연락 qa@example.com";
  await page
    .getByLabel("검토할 파일")
    .setInputFiles({
      name: "review-document.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(text),
    });
  await page
    .getByLabel("이 자료를 보관하고 업무에 활용할 권한이 있음을 확인했습니다.")
    .check();
  await page
    .getByRole("button", { name: "문서 읽기 시작", exact: true })
    .click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/, { timeout: 45_000 });
  const id = page.url().split("/").at(-1)!;
  const initial = await ready(context, id, baseURL!);
  expect(initial.sections.at(-1).text).toContain("파란 연필");
  expect(JSON.stringify(initial.sections)).not.toContain("qa@example.com");
  await page.reload();
  await page.getByLabel("구간 1 텍스트").fill("사람이 교정한 문서 내용입니다.");
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("초안을 저장");
  const stale = await context.request.patch(
    `${baseURL}/api/d/${dept}/reviews/${id}`,
    { data: { revision: 1, title: "옛 창", sections: [] } },
  );
  expect(stale.status()).toBe(409);
  await page
    .getByRole("button", { name: "원본 다시 읽기", exact: true })
    .click();
  await ready(context, id, baseURL!);
  await expect(
    page.getByRole("heading", { name: "새 추출 결과가 도착했습니다" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("구간 1 텍스트")).toHaveValue(
    "사람이 교정한 문서 내용입니다.",
  );
  await page
    .getByRole("button", { name: "현재 교정 유지", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "새 추출 결과가 도착했습니다" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `${evidence}/document-review.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "원본 다시 읽기", exact: true })
    .click();
  await ready(context, id, baseURL!);
  await page
    .getByRole("button", { name: "새 추출문으로 교체", exact: true })
    .click();
  await expect(page.getByLabel("구간 1 텍스트")).not.toHaveValue(
    "사람이 교정한 문서 내용입니다.",
  );
  const deleted = await context.request.post(
    `${baseURL}/api/d/${dept}/reviews/${id}`,
    { data: { action: "delete", revision: 3 } },
  );
  expect(deleted.ok()).toBe(true);
});

test("지원 문서 형식과 손상 PDF·처리 중단", async ({
  page,
  context,
  baseURL,
  browser,
}) => {
  test.setTimeout(180_000);
  await signInSeedUser(context, baseURL!, SEED_LEAD);
  const pdfPage = await browser.newPage();
  await pdfPage.setContent(
    '<html lang="ko"><body><h1>문서 검토 합성 PDF</h1><p>마지막 검증 문장은 파란 연필입니다.</p></body></html>',
  );
  const pdf = await pdfPage.pdf();
  await pdfPage.close();
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>마지막 검증 문장은 파란 연필입니다.</w:t></w:r></w:p></w:body></w:document>',
  );
  const files = [
    {
      name: "check.md",
      mime: "text/markdown",
      bytes: Buffer.from("# 검토\n마지막 검증 문장은 파란 연필입니다."),
    },
    {
      name: "check.csv",
      mime: "text/csv",
      bytes: Buffer.from("항목,결과\n마지막,파란 연필"),
    },
    {
      name: "check.json",
      mime: "application/json",
      bytes: Buffer.from(JSON.stringify({ 마지막: "파란 연필" })),
    },
    { name: "check.pdf", mime: "application/pdf", bytes: pdf },
    {
      name: "check.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: await zip.generateAsync({ type: "nodebuffer" }),
    },
  ];
  for (const file of files) {
    const response = await context.request.post(
      `${baseURL}/api/d/${dept}/documents`,
      {
        multipart: {
          file: { name: file.name, mimeType: file.mime, buffer: file.bytes },
          title: file.name,
        },
      },
    );
    expect(response.status()).toBe(202);
    const { review_id: id } = await response.json();
    const result = await ready(context, id, baseURL!);
    expect(
      result.sections.map((s: { text: string }) => s.text).join(" "),
    ).toContain("파란 연필");
    await context.request.post(`${baseURL}/api/d/${dept}/reviews/${id}`, {
      data: { action: "delete", revision: 1 },
    });
  }
  const broken = await context.request.post(
    `${baseURL}/api/d/${dept}/documents`,
    {
      multipart: {
        file: {
          name: "broken.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("not a real pdf"),
        },
      },
    },
  );
  expect(broken.status()).toBe(202);
  const { review_id: id } = await broken.json();
  await expect
    .poll(
      async () =>
        (
          await (
            await context.request.get(`${baseURL}/api/d/${dept}/reviews/${id}`)
          ).json()
        ).review.status,
      { timeout: 30_000 },
    )
    .toBe("failed");
  await page.goto(`/d/${dept}/reviews/${id}`);
  await expect(
    page.getByRole("button", { name: "확인 후 확정" }),
  ).toBeDisabled();
  await page.screenshot({
    path: `${evidence}/document-failure.png`,
    fullPage: true,
  });
  expect(
    (
      await context.request.post(`${baseURL}/api/d/${dept}/reviews/${id}`, {
        data: { action: "publish", revision: 1 },
      })
    ).status(),
  ).toBe(422);
  await context.request.post(`${baseURL}/api/d/${dept}/reviews/${id}`, {
    data: { action: "delete", revision: 1 },
  });
});

test("Slack 보존 현황·설정·체크섬 내보내기·멤버 차단", async ({
  page,
  context,
  baseURL,
}) => {
  await signInSeedUser(context, baseURL!, SEED_LEAD);
  const client = serviceClient();
  const ids = JSON.parse(readFileSync(".vercel/review-qa/ids.json", "utf8"));
  await client
    .from("members")
    .update({ slack_user_id: "U_REVIEW_EXPORT" })
    .eq("user_id", ids.lead)
    .eq("dept_id", dept);
  const source = await client
    .from("sources")
    .insert({
      dept_id: dept,
      kind: "slack_channel",
      external_id: `C_REVIEW_${Date.now()}`,
      title: "보존 검증 합성 채널",
      active: true,
    })
    .select("id")
    .single();
  expect(source.error).toBeNull();
  await client
    .from("items")
    .insert({
      source_id: source.data!.id,
      dept_id: dept,
      author_ext_id: "U_REVIEW_EXPORT",
      author: "합성 담당자",
      content: "검토 후 다음 주에 진행합니다.",
      spoken_at: "2026-09-16T00:00:00Z",
      external_ref: "1789516800.000001",
    });
  await page.goto(`/d/${dept}/retention`);
  await page.getByLabel("확인한 요금제", { exact: true }).selectOption("free");
  await page.getByLabel("확인한 메시지 보존 기간").selectOption("90");
  await page.getByRole("button", { name: "확인값 저장" }).click();
  await expect(page.getByRole("status")).toContainText("기록했습니다");
  await page.getByLabel("대상 채널").selectOption(source.data!.id);
  await page.getByLabel("보존 시작일").fill("2026-09-01");
  await page.getByLabel("보존 종료일").fill("2026-09-17");
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "체크섬 포함 보관 묶음 다운로드" })
    .click();
  const download = await downloading;
  const bundle = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(bundle.manifest.count).toBe(1);
  expect(bundle.manifest.attachments_included).toBe(false);
  expect(bundle.records[0].content).toContain("검토 후");
  expect(bundle.manifest.sha256.records).toMatch(/^[a-f0-9]{64}$/);
  await page.screenshot({
    path: `${evidence}/slack-retention.png`,
    fullPage: true,
  });
  const other = await page.context().browser()!.newContext();
  await signInSeedUser(other, baseURL!, SEED_MEMBER);
  expect(
    (
      await other.request.post(`${baseURL}/api/d/${dept}/retention/export`, {
        data: {
          source_id: source.data!.id,
          from: "2026-09-01",
          to: "2026-09-17",
          format: "json",
        },
      })
    ).status(),
  ).toBe(403);
  await other.close();
});
