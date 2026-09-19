import { expect, test } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { serviceClient, signInSeedUser } from "./support/auth";

test.skip(process.env.E2E_REVIEW_LIVE !== "1" || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""), "실제 로컬 Supabase만 사용");

function syntheticWav() {
  const data = Buffer.alloc(44 + 16000 * 2);
  data.write("RIFF", 0); data.writeUInt32LE(data.length - 8, 4); data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(16000, 24); data.writeUInt32LE(32000, 28); data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34); data.write("data", 36); data.writeUInt32LE(data.length - 44, 40);
  return data;
}

test("실제 세션·원본 API·Storage 재생과 조직 내려받기 스위치", async ({ page, context, baseURL }) => {
  test.setTimeout(180_000);
  const admin = serviceClient();
  const org = randomUUID(), dept = randomUUID(), audio = randomUUID(), document = randomUUID();
  const evidence = "docs/verification/browser-meeting-recording";
  mkdirSync(evidence, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.name));
  process.env.ACCESS_QA_EMAIL = `browser-access-${randomUUID()}@example.test`;
  process.env.ACCESS_QA_PASSWORD = randomBytes(32).toString("base64url");
  const created = await admin.auth.admin.createUser({ email: process.env.ACCESS_QA_EMAIL, password: process.env.ACCESS_QA_PASSWORD, email_confirm: true });
  expect(created.error).toBeNull();
  const actorId = created.data.user!.id;
  expect((await admin.from("orgs").insert({ id: org, name: "원본 보호 브라우저 QA" })).error).toBeNull();
  expect((await admin.from("departments").insert({ id: dept, org_id: org, name: "합성 자료 검증" })).error).toBeNull();
  expect((await admin.from("members").insert({ dept_id: dept, user_id: actorId, role: "lead", display_name: "합성 검토자", consented_at: new Date().toISOString() })).error).toBeNull();
  expect((await admin.from("org_admins").insert({ org_id: org, user_id: actorId, granted_by: "isolated browser QA" })).error).toBeNull();
  const { supabase } = await signInSeedUser(context, baseURL!, { emailEnv: "ACCESS_QA_EMAIL", passwordEnv: "ACCESS_QA_PASSWORD" });
  const fixtures = [[audio, "audio", syntheticWav(), "audio/wav"], [document, "document", Buffer.from("합성 문서 원본 검증"), "text/plain"]] as const;
  try {
    for (const [id, kind, bytes, contentType] of fixtures) {
      expect((await supabase.rpc("create_review", { p_dept: dept, p_input: { id, kind, title: "합성 원본 접근 검증", filename: kind === "audio" ? "synthetic.wav" : "synthetic.txt", size: bytes.length, fingerprint: "d".repeat(64), duration: kind === "audio" ? 1 : null, visibility: "dept", participants: [], synthetic: true, consent_confirmed: true } })).error).toBeNull();
      expect((await supabase.storage.from("review-materials").upload(`${dept}/${id}/original`, bytes, { contentType })).error).toBeNull();
      // Fixture only: skip transcription/LLM so this test isolates access control.
      expect((await admin.from("reviewed_materials").update({ status: "ready", sections: [{ id: "section-0", text: "합성 전사 검증", original_text: "합성 전사 검증", origin: "extracted", edited: false, location: null, start_seconds: kind === "audio" ? 0 : null, end_seconds: kind === "audio" ? 1 : null }] }).eq("id", id)).error).toBeNull();
    }
    const endpoint = `/api/d/${dept}/reviews/${audio}/original`;
    await page.goto(`/d/${dept}/reviews/${audio}`);
    await expect(page.getByLabel("구간 1 텍스트")).toBeVisible();
    await expect(page.getByRole("button", { name: "원본 파일 다운로드", exact: true })).toHaveCount(0);
    const response = page.waitForResponse(res => res.url().includes(`${endpoint}?action=play_original`));
    await page.getByRole("button", { name: "원본 듣기", exact: true }).click();
    const original = await response;
    expect(original.status()).toBe(200);
    expect(original.headers()["cache-control"]).toContain("no-store");
    expect(original.headers()["content-type"]).toBe("audio/wav");
    await expect.poll(() => page.locator("audio").evaluate((element: HTMLAudioElement) => element.duration)).toBe(1);
    // Check bytes actually received by the page, not CDP's media response capture.
    const received = await page.locator("audio").evaluate(async (element: HTMLAudioElement) => Array.from(new Uint8Array(await (await fetch(element.src)).arrayBuffer())));
    expect(Buffer.from(received).equals(fixtures[0][2])).toBe(true);
    await page.locator("audio").evaluate(async (element: HTMLAudioElement) => { await element.play(); });
    await expect.poll(() => page.locator("audio").evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0);
    await page.locator("audio").evaluate((element: HTMLAudioElement) => element.pause());
    await page.screenshot({ path: `${evidence}/access-live-playback.png`, fullPage: true });
    expect((await context.request.get(`${endpoint}?action=download_original`)).status()).toBe(403);
    expect((await supabase.storage.from("review-materials").download(`${dept}/${audio}/original`)).error).toBeTruthy();
    await page.goto(`/d/${dept}/reviews/${document}`);
    await expect(page.getByText("조직에서 원본 내려받기를 허용하지 않았습니다", { exact: true })).toBeVisible();
    expect((await context.request.get(`/api/d/${dept}/reviews/${document}/original?action=play_original`)).status()).toBe(400);
    expect((await context.request.get(`/api/d/${dept}/reviews/${document}/original?action=download_original`)).status()).toBe(403);
    await page.goto("/admin/security");
    await page.getByLabel("원본 파일 내려받기 허용").check();
    await page.getByRole("button", { name: "원본 보호 설정 저장", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("저장했습니다");
    await page.goto(`/d/${dept}/reviews/${document}`);
    await page.getByRole("button", { name: "원본 열기", exact: true }).click();
    const pendingDownload = page.waitForEvent("download");
    await page.getByRole("link", { name: "원본 파일 다운로드", exact: true }).click();
    const downloaded = await pendingDownload;
    expect(downloaded.suggestedFilename()).toBe("synthetic.txt");
    expect(readFileSync((await downloaded.path())!).equals(fixtures[1][2])).toBe(true);
    const audit = await supabase.from("review_access_events").select("action").eq("actor_id", actorId);
    expect(audit.error).toBeNull();
    expect(audit.data?.map(row => row.action)).toEqual(expect.arrayContaining(["play_original", "download_original"]));
    expect(errors).toEqual([]);
  } finally {
    for (const [id] of fixtures) {
      await supabase.rpc("review_action", { p_review: id, p_revision: 1, p_action: "delete" });
      expect((await admin.storage.from("review-materials").remove([`${dept}/${id}/original`])).error).toBeNull();
    }
    await supabase.auth.signOut();
    delete process.env.ACCESS_QA_EMAIL; delete process.env.ACCESS_QA_PASSWORD;
  }
});
