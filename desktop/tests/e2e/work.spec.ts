import { expect, test, _electron as electron } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.SASU_DESKTOP_E2E === "1";
const repoRoot = resolve(process.cwd(), "..");

function status(): Record<string, string> {
  const output = execFileSync(
    process.platform === "win32" ? "cmd.exe" : "npx",
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npx --yes supabase status --workdir .vercel/review-qa -o json"]
      : ["--yes", "supabase", "status", "--workdir", ".vercel/review-qa", "-o", "json"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return JSON.parse(output.slice(output.indexOf("{"))) as Record<string, string>;
}

function sql(query: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", "supabase_db_review-qa", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-q"],
    { input: query, encoding: "utf8" },
  ).trim();
}

function buildForQa(local: Record<string, string>): void {
  execFileSync(
    process.platform === "win32" ? "cmd.exe" : "npm",
    process.platform === "win32" ? ["/d", "/s", "/c", "npm run build"] : ["run", "build"],
    {
      cwd: resolve(repoRoot, "desktop"),
      env: { ...process.env, SASU_APP_URL: "http://127.0.0.1:3011", SUPABASE_URL: local.API_URL, SUPABASE_ANON_KEY: local.ANON_KEY },
      stdio: "inherit",
    },
  );
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function wavTwoSeconds(): Uint8Array {
  const samples = 32_000;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string): void => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, samples * 2, true);
  return bytes;
}

async function linkedDevice(local: Record<string, string>, email: string, deptId: string) {
  const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const userData = mkdtempSync(resolve(tmpdir(), "sasu-desktop-work-"));
  const app = await electron.launch({
    args: [".", `--user-data-dir=${userData}`],
    executablePath: process.env.ELECTRON_EXECUTABLE_PATH ?? resolve(process.cwd(), "node_modules/electron/dist/electron.exe"),
    env: { ...process.env, SASU_APP_URL: "http://127.0.0.1:3011" },
  });
  const panel = app.windows().find((page) => page.url().includes("#panel"));
  expect(panel).toBeTruthy();
  const generated = await admin.auth.admin.generateLink({ type: "magiclink", email });
  expect(generated.error).toBeNull();
  await panel!.evaluate(async ({ address, code, linkedDept }) => {
    await window.sasu.auth.verifyCode(address, code);
    await window.sasu.link.create({ dept_id: linkedDept, device_name: "데스크톱 작업 QA" });
  }, { address: email, code: generated.data.properties.email_otp!, linkedDept: deptId });
  await panel!.reload();
  return { app, panel: panel!, userData };
}

async function capturePanel(app: Awaited<ReturnType<typeof electron.launch>>, path: string): Promise<void> {
  const png = await app.evaluate(async ({ BrowserWindow }) => {
    const panel = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("#panel"));
    if (!panel) throw new Error("panel_missing");
    return (await panel.webContents.capturePage()).toPNG().toString("base64");
  });
  writeFileSync(path, png, "base64");
}

test.describe("desktop companion work", () => {
  test.skip(!enabled, "로컬 QA의 팀장·팀원 기기와 Storage를 준비한 뒤 SASU_DESKTOP_E2E=1로 실행합니다.");

  test("팀장 기기는 자료를 올리고 원문 네 건 검토를 요청하며 팀원 IPC는 거부한다", async () => {
    test.setTimeout(120_000);
    const local = status();
    buildForQa(local);
    const ids = JSON.parse(execFileSync("powershell", ["-NoProfile", "-Command", "Get-Content -Raw .vercel/review-qa/ids.json"], { cwd: repoRoot, encoding: "utf8" })) as { lead: string; member: string; dept: string };
    const sourceIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const itemIds = sourceIds.map(() => randomUUID());
    const documentId = randomUUID();
    const audioId = randomUUID();
    const requestId = randomUUID();
    const document = new TextEncoder().encode("작은 합성 문서입니다.");
    const audio = wavTwoSeconds();
    const screenshots = resolve(repoRoot, "docs/verification/43-desktop-companion/screenshots");
    mkdirSync(screenshots, { recursive: true });
    sql(`
      update device_links set revoked_at=now(), revoked_reason='relink' where user_id in ('${ids.lead}','${ids.member}') and revoked_at is null;
      update members set consented_at=now() where dept_id='${ids.dept}' and user_id in ('${ids.lead}','${ids.member}');
      ${sourceIds.map((source, index) => `insert into sources(id,dept_id,kind,external_id,title,visibility,active,is_principles) values ('${source}','${ids.dept}','document','desktop-work-${source}','${index === 3 ? "영업 원칙" : `영업 원문 ${index + 1}`}','dept',true,${index === 3}); insert into items(id,source_id,dept_id,content,author) values ('${itemIds[index]}','${source}','${ids.dept}','${index === 3 ? "영업 원칙과 승인 조건을 확인합니다." : `견적 원문 ${index + 1}의 합성 내용입니다.`}','합성 작성자');`).join("\n")}
      notify pgrst,'reload schema';
    `);
    const lead = await linkedDevice(local, "review-lead@example.test", ids.dept);
    try {
      await lead.panel.getByRole("button", { name: "일 맡기기" }).click();
      await expect(lead.panel.getByRole("heading", { name: "올린 자료 확인" })).toBeVisible();
      await expect(lead.panel.getByRole("heading", { name: "영업 원문 검토" })).toBeVisible();
      await capturePanel(lead.app, resolve(screenshots, "desktop-work-lead.png"));
      expect((await lead.panel.evaluate(() => window.sasu.link.get())).dept.id).toBe(ids.dept);

      const documentUpload = await lead.panel.evaluate(async ({ id, bytes, fingerprint }) => window.sasu.upload.review({
        review: { id, kind: "document", title: "작은 합성 문서", filename: "small.txt", size: bytes.length, fingerprint, duration: null, visibility: "dept", participants: [], synthetic: false, consent_confirmed: true },
        contentType: "text/plain", original: new Uint8Array(bytes), parts: [],
      }), { id: documentId, bytes: [...document], fingerprint: sha256(document) });
      expect(documentUpload.id).toBe(documentId);
      expect(documentUpload.job_ids).toHaveLength(1);
      console.log(`e2e review document 201 original ${documentId} part 202 ${documentUpload.job_ids[0]}`);

      const audioUpload = await lead.panel.evaluate(async ({ id, bytes, fingerprint }) => window.sasu.upload.review({
        review: { id, kind: "audio", title: "2초 합성 음성", filename: "two-seconds.wav", size: bytes.length, fingerprint, duration: 2, visibility: "leads_only", participants: [], synthetic: true, consent_confirmed: true },
        contentType: "audio/wav", original: new Uint8Array(bytes), parts: [{ index: 0, seconds: 2, bytes: new Uint8Array(bytes) }],
      }), { id: audioId, bytes: [...audio], fingerprint: sha256(audio) });
      expect(audioUpload.id).toBe(audioId);
      expect(audioUpload.job_ids).toHaveLength(1);
      console.log(`e2e review audio 201 original ${audioId} part 202 ${audioUpload.job_ids[0]}`);

      const storage = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      for (const path of [`${ids.dept}/${documentId}/original`, `${ids.dept}/${audioId}/original`, `${ids.dept}/${audioId}/parts/0.wav`]) {
        const read = await storage.storage.from("review-materials").download(path);
        expect(read.error).toBeNull();
        expect(read.data).not.toBeNull();
      }
      expect(["queued", "processing", "done", "ready"]).toContain(
        sql(`select status from review_parts where review_id='${documentId}' and part_index=0;`),
      );
      expect(sql(`select count(*) from jobs where id='${documentUpload.job_ids[0]}';`)).toBe("1");
      expect(["queued", "processing", "done", "ready"]).toContain(
        sql(`select status from review_parts where review_id='${audioId}' and part_index=0;`),
      );
      expect(sql(`select count(*) from jobs where id='${audioUpload.job_ids[0]}';`)).toBe("1");

      const input = { request_item_id: itemIds[0], old_quote_item_id: itemIds[1], new_quote_item_id: itemIds[2], policy_item_id: itemIds[3], request_id: requestId };
      const started = await lead.panel.evaluate((value) => window.sasu.sales.start(value), input);
      const repeated = await lead.panel.evaluate((value) => window.sasu.sales.start(value), input);
      expect(repeated.task_id).toBe(started.task_id);
      const salesStatus = await lead.panel.evaluate((taskId) => window.sasu.sales.status(taskId), started.task_id);
      expect(["queued", "processing", "ready", "refused", "failed"]).toContain(salesStatus.status);
      console.log(`e2e sales request 202 idempotent ${started.task_id} status ${salesStatus.status}`);
    } finally {
      await lead.app.close();
      rmSync(lead.userData, { recursive: true, force: true });
    }

    const member = await linkedDevice(local, "review-member@example.test", ids.dept);
    try {
      await member.panel.getByRole("button", { name: "일 맡기기" }).click();
      await expect(member.panel.getByText("팀장만 사용할 수 있어요.")).toBeVisible();
      await expect(member.panel.getByRole("heading", { name: "올린 자료 확인" })).toHaveCount(0);
      await expect(member.panel.getByRole("heading", { name: "영업 원문 검토" })).toHaveCount(0);
      await capturePanel(member.app, resolve(screenshots, "desktop-work-member.png"));
      const denied = await member.panel.evaluate(async ({ id, bytes, fingerprint }) => {
        const results = await Promise.allSettled([
          window.sasu.members.list(),
          window.sasu.sales.sources(),
          window.sasu.upload.review({ review: { id, kind: "document", title: "거부 확인", filename: "denied.txt", size: bytes.length, fingerprint, duration: null, visibility: "dept", participants: [], synthetic: false, consent_confirmed: true }, contentType: "text/plain", original: new Uint8Array(bytes), parts: [] }),
        ]);
        return results.map((result) => result.status === "rejected" && result.reason instanceof Error && result.reason.message.includes("lead_only") ? "lead_only" : "accepted");
      }, { id: randomUUID(), bytes: [...document], fingerprint: sha256(document) });
      expect(denied).toEqual(["lead_only", "lead_only", "lead_only"]);
      console.log("e2e member IPC 403 lead_only");
    } finally {
      await member.app.close();
      rmSync(member.userData, { recursive: true, force: true });
      sql(`
        delete from jobs where payload->>'partId' in (select id::text from review_parts where review_id in ('${documentId}','${audioId}')) or payload->>'taskId' in (select id::text from sales_source_reviews where client_request_id='${requestId}');
        delete from sales_source_reviews where client_request_id='${requestId}';
        delete from review_access_events where review_id in ('${documentId}','${audioId}');
        delete from review_original_segments where review_id in ('${documentId}','${audioId}');
        delete from review_revisions where review_id in ('${documentId}','${audioId}');
        delete from review_parts where review_id in ('${documentId}','${audioId}');
        delete from reviewed_materials where id in ('${documentId}','${audioId}');
        delete from items where id in ('${itemIds.join("','")}');
        delete from sources where id in ('${sourceIds.join("','")}');
        update device_links set revoked_at=now(), revoked_reason='relink' where user_id in ('${ids.lead}','${ids.member}') and revoked_at is null;
      `);
    }
  });
});
