import { expect, test, _electron as electron, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer, type Server } from "node:https";

// Synthetic HTTPS fixture; the packaged IPC, upload adapter and renderer remain real.
test.describe("desktop upload recovery", () => {
  test.describe.configure({ timeout: 150_000 });
  const userId = randomUUID(), deptId = randomUUID(), linkId = randomUUID();
  let server: Server, origin: string, tlsDirectory: string, certificatePath: string;
  let createMode = "normal", partsMode = "normal", membersMode = "normal";
  let created: Record<string, unknown>[], memberRequests: number;
  let releaseParts: (() => void) | null, releaseMembers: (() => void) | null;
  test.beforeEach(() => {
    createMode = "normal"; partsMode = "normal"; membersMode = "normal";
    created = []; memberRequests = 0; releaseParts = null; releaseMembers = null;
  });
  test.beforeAll(async () => {
    tlsDirectory = mkdtempSync(resolve(tmpdir(), "sasu-upload-tls-"));
    certificatePath = resolve(tlsDirectory, "certificate.pem");
    const keyPath = resolve(tlsDirectory, "key.pem");
    const bundled = "C:/Program Files/Git/usr/bin/openssl.exe";
    execFileSync(process.env.SASU_TEST_OPENSSL ?? (existsSync(bundled) ? bundled : "openssl"), ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", keyPath, "-out", certificatePath], { stdio: "ignore" });
    const user = { id: userId, aud: "authenticated", role: "authenticated", email: "synthetic@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: expiresAt })).toString("base64url")}.${Buffer.from("synthetic-signature").toString("base64url")}`;
    server = createServer({ key: readFileSync(keyPath), cert: readFileSync(certificatePath) }, async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const path = new URL(request.url!, "https://localhost").pathname;
      response.setHeader("content-type", "application/json");
      const fail = (message: string) => { response.statusCode = 503; response.end(JSON.stringify({ code: "synthetic_failed", error: message })); };
      if (path === "/auth/v1/verify") response.end(JSON.stringify({ access_token: token, refresh_token: "synthetic-refresh", expires_in: 3600, expires_at: expiresAt, token_type: "bearer", user }));
      else if (path === "/auth/v1/user") response.end(JSON.stringify(user));
      else if (path.startsWith("/auth/")) response.end("{}");
      else if (path === "/api/companion/link" && request.method === "DELETE") { response.statusCode = 204; response.end(); }
      else if (path === "/api/companion/link") response.end(JSON.stringify({ link_id: linkId, dept: { id: deptId, name: "합성 부서" }, role: "lead", ...(request.method === "POST" ? {} : { display_name: "합성 팀장" }) }));
      else if (path === "/api/companion/inbox") response.end(JSON.stringify({ server_time: new Date().toISOString(), cards: [], answers: [], reviews: [], sales: [] }));
      else if (path === "/api/companion/sales-review/sources") response.end(JSON.stringify({ candidates: [] }));
      else if (path === "/api/companion/members") {
        memberRequests += 1;
        const mode = membersMode;
        if (mode.startsWith("delayed")) await new Promise<void>((resolve) => { releaseMembers = resolve; });
        if (mode === "error" || mode === "delayedError") fail("합성 참여자 조회 실패");
        else response.end(JSON.stringify({ members: mode === "empty" ? [] : [{ user_id: userId, display_name: "합성 참여자", consented_at: new Date().toISOString() }] }));
      } else if (path === "/api/companion/reviews" && request.method === "POST") {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")); created.push(body);
        if (createMode === "error") fail("합성 업로드 접수 실패");
        else { response.statusCode = 201; response.end(JSON.stringify({ id: body.id })); }
      } else if (path.startsWith("/storage/v1/object/")) response.end(JSON.stringify({ Key: path.slice("/storage/v1/object/".length), Id: randomUUID() }));
      else if (path.match(/^\/api\/companion\/reviews\/[^/]+\/parts$/u)) {
        const mode = partsMode;
        if (mode.startsWith("delayed")) await new Promise<void>((resolve) => { releaseParts = resolve; });
        if (mode === "delayedError") fail("합성 업로드 처리 실패");
        else { response.statusCode = 202; response.end(JSON.stringify({ job_id: randomUUID() })); }
      } else { response.statusCode = 404; response.end(JSON.stringify({ code: "not_found", error: "합성 경로 없음" })); }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("fixture_address_missing");
    origin = `https://127.0.0.1:${address.port}`;
    const development = process.env.SASU_DESKTOP_REACT_MODE === "development";
    execFileSync(development ? process.execPath : "cmd.exe", development ? ["tests/e2e/build-development-react.mjs"] : ["/d", "/s", "/c", "npm run build"], { cwd: process.cwd(), env: { ...process.env, SASU_APP_URL: origin, SUPABASE_URL: origin, SUPABASE_ANON_KEY: "synthetic-public-key" }, stdio: "inherit" });
  });
  test.afterAll(async () => {
    server?.closeAllConnections();
    if (server) await new Promise<void>((resolve, reject) => server.close((cause) => cause ? reject(cause) : resolve()));
    if (tlsDirectory) { if (!resolve(tlsDirectory).startsWith(resolve(tmpdir(), "sasu-upload-tls-"))) throw new Error("unsafe_tls_path"); await rm(tlsDirectory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  });
  async function launch() {
    console.log("upload_fixture_stage", "launch");
    const userData = mkdtempSync(resolve(tmpdir(), "sasu-upload-profile-"));
    const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`], executablePath: resolve(process.cwd(), "node_modules/electron/dist/electron.exe"), env: { ...process.env, SASU_DISABLE_UPDATER: "1", NODE_EXTRA_CA_CERTS: certificatePath } });
    const close = async () => {
      console.log("upload_fixture_close", "begin", Date.now());
      await app.close();
      console.log("upload_fixture_close", "app-closed", Date.now());
      if (!resolve(userData).startsWith(resolve(tmpdir(), "sasu-upload-profile-"))) throw new Error("unsafe_profile_path");
      await rm(userData, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
      console.log("upload_fixture_close", "profile-removed", Date.now());
    };
    try {
      console.log("upload_fixture_stage", "main-connected");
      await app.evaluate((_electron, pem) => {
        const tls = process.getBuiltinModule("node:tls") as typeof import("node:tls");
        tls.setDefaultCACertificates([...tls.getCACertificates(), pem]);
      }, readFileSync(certificatePath, "utf8"));
      await app.evaluate(({ session }, pem) => session.defaultSession.setCertificateVerifyProc((request, callback) => {
        callback(request.hostname === "127.0.0.1" && request.certificate.data.trim() === pem.trim() ? 0 : -3);
      }), readFileSync(certificatePath, "utf8"));
      await expect.poll(() => app.windows().some((page) => page.url().includes("#panel")), { timeout: 30_000 }).toBe(true);
      const panel = app.windows().find((page) => page.url().includes("#panel"))!;
      panel.on("pageerror", (cause) => console.log("upload_fixture_renderer_error", cause.name, cause.message));
      await expect(panel.getByRole("heading", { name: "사수 시작하기" })).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => panel.evaluate(() => window.sasu.app.info().then(() => true).catch(() => false)), { timeout: 30_000 }).toBe(true);
      console.log("upload_fixture_stage", "sender-ready");
      if (process.env.SASU_DESKTOP_REACT_MODE === "development") await panel.addInitScript(() => {
        Reflect.set(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", { supportsFiber: true, inject: (renderer: { bundleType: number }) => { Reflect.set(window, "uploadReactBundleType", renderer.bundleType); return 1; }, onCommitFiberRoot: (_id: number, root: unknown) => Reflect.set(window, "uploadReactRoot", root), onCommitFiberUnmount: () => undefined, checkDCE: () => undefined });
      });
      await panel.evaluate(async (dept) => { await window.sasu.auth.verifyCode("synthetic@example.test", "123456"); await window.sasu.link.create({ dept_id: dept }); }, deptId);
      await panel.reload();
      await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible({ timeout: 30_000 });
      console.log("upload_fixture_stage", "panel-ready");
      await app.evaluate(({ BrowserWindow }) => { const panel = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("#panel")); panel?.show(); panel?.focus(); });
      await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
      console.log("upload_fixture_stage", "work-entered");
      await app.evaluate(({ shell }) => {
        Reflect.set(globalThis, "uploadOpened", []); Reflect.set(globalThis, "uploadOpenMode", "normal");
        shell.openExternal = async (url) => {
          if (Reflect.get(globalThis, "uploadOpenMode") === "error") throw new Error("synthetic_shell_failed");
          (Reflect.get(globalThis, "uploadOpened") as string[]).push(url);
          if (Reflect.get(globalThis, "uploadOpenMode") === "delayed") await new Promise<void>((resolve) => { Reflect.set(globalThis, "releaseUploadOpen", resolve); });
        };
      });
      return { app, panel, close };
    } catch (cause) { await close(); throw cause; }
  }
  async function document(panel: Page) {
    await panel.getByLabel("검토할 파일").setInputFiles({ name: "synthetic.txt", mimeType: "text/plain", buffer: Buffer.from("합성 문서 내용") });
    await panel.getByLabel("자료 제목").fill("합성 제목");
    await panel.getByLabel("참여자 동의 확인").check();
  }
  const link = (panel: Page) => panel.getByRole("button", { name: "웹에서 이어서 하기" });
  const submit = (panel: Page) => panel.getByRole("button", { name: "자료 올리기", exact: true });
  const section = (panel: Page) => panel.locator('section[aria-labelledby="review-upload-title"]');
  const opened = (app: Awaited<ReturnType<typeof launch>>["app"]) => app.evaluate(() => Reflect.get(globalThis, "uploadOpened") as string[]);
  function wav() {
    const samples = 32_000, bytes = Buffer.alloc(44 + samples * 2);
    bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVE", 8); bytes.write("fmt ", 12);
    bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(16_000, 24);
    bytes.writeUInt32LE(32_000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(samples * 2, 40);
    return bytes;
  }

  test("접수 전 링크 없음·연타 1회·입력 동결·성공 웹/읽음", async () => {
    partsMode = "delayed";
    const { app, panel, close } = await launch();
    try {
      await document(panel);
      console.log("upload_fixture_stage", "draft-prepared");
      await submit(panel).evaluate((node) => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
      await expect.poll(() => !!releaseParts).toBe(true);
      console.log("upload_fixture_stage", "parts-pending");
      await expect(link(panel)).toHaveCount(0); expect(created).toHaveLength(1);
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((entry) => entry.webContents.getURL().includes("#panel"))!.webContents.send("review-upload-progress", { stage: "part", current: 99, total: 99 }));
      await expect(section(panel).getByText("구간 99/99 보관 중")).toHaveCount(0);
      for (const control of await section(panel).locator("input,select,textarea").all()) await expect(control).toBeDisabled();
      await expect(section(panel).getByRole("button", { name: "음성 파일", exact: true })).toBeDisabled();
      partsMode = "normal"; releaseParts!();
      console.log("upload_fixture_stage", "parts-released");
      await expect(link(panel)).toBeVisible();
      const screenshots = resolve(process.cwd(), "../docs/verification/48-desktop-upload-recovery/screenshots");
      mkdirSync(screenshots, { recursive: true });
      await section(panel).screenshot({ path: resolve(screenshots, "upload-accepted.png") });
      expect(await panel.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await link(panel).click();
      await expect.poll(async () => (await panel.evaluate(() => window.sasu.settings.get())).seen).toContain(created[0].id);
      expect(await opened(app)).toEqual([`${origin}/d/${deptId}/reviews/${created[0].id}`]);
      await expect(submit(panel)).toBeDisabled();
      await panel.getByLabel("자료 제목").fill("새 합성 제목");
      await expect(link(panel)).toHaveCount(0); await expect(submit(panel)).toBeEnabled();
    } finally { releaseParts?.(); await close(); }
  });
  test("업로드 실패 링크 없음·초안 동의 보존·자동 재전송 없음·수동 retry", async () => {
    createMode = "error"; const { panel, close } = await launch();
    try {
      await document(panel); await submit(panel).click();
      await expect(panel.getByText("합성 업로드 접수 실패", { exact: true })).toBeVisible();
      await expect(link(panel)).toHaveCount(0); await expect(panel.getByLabel("자료 제목")).toHaveValue("합성 제목");
      await expect(panel.getByLabel("참여자 동의 확인")).toBeChecked();
      await panel.waitForTimeout(400); expect(created).toHaveLength(1);
      createMode = "normal"; await submit(panel).click(); await expect(link(panel)).toBeVisible(); expect(created).toHaveLength(2);
    } finally { await close(); }
  });
  test("웹 실패 읽음 없음·오류 안내·retry와 지연 연타 한 번", async () => {
    const { app, panel, close } = await launch();
    try {
      await document(panel); await submit(panel).click(); await expect(link(panel)).toBeVisible();
      await app.evaluate(() => Reflect.set(globalThis, "uploadOpenMode", "error")); await link(panel).click();
      await expect(panel.locator(".content > .notice")).toBeVisible();
      expect((await panel.evaluate(() => window.sasu.settings.get())).seen).not.toContain(created[0].id);
      await app.evaluate(() => Reflect.set(globalThis, "uploadOpenMode", "delayed"));
      await link(panel).evaluate((node) => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
      await expect.poll(() => opened(app)).toHaveLength(1);
      expect((await panel.evaluate(() => window.sasu.settings.get())).seen).not.toContain(created[0].id);
      await app.evaluate(() => (Reflect.get(globalThis, "releaseUploadOpen") as () => void)());
      await expect.poll(async () => (await panel.evaluate(() => window.sasu.settings.get())).seen).toContain(created[0].id);
    } finally { await close(); }
  });
  for (const departure of ["tab", "same", "logout"] as const) test(`늦은 업로드 완료는 ${departure} 뒤 notice/링크 없음`, async () => {
    partsMode = "delayed"; const { panel, close } = await launch();
    try {
      await document(panel); await submit(panel).click(); await expect.poll(() => !!releaseParts).toBe(true);
      if (departure === "same") await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
      else if (departure === "tab") await panel.getByRole("button", { name: "질문", exact: true }).click();
      else { await panel.getByRole("button", { name: "설정", exact: true }).click(); await panel.getByRole("button", { name: "로그아웃하기" }).click(); }
      partsMode = "normal"; releaseParts!(); await panel.waitForTimeout(350);
      await expect(panel.getByText(/자료를 올렸습니다/u)).toHaveCount(0); await expect(link(panel)).toHaveCount(0); expect(created).toHaveLength(1);
    } finally { releaseParts?.(); await close(); }
  });
  for (const stage of ["read", "hash"] as const) test(`늦은 파일 ${stage} 뒤 새 업로드 IPC 없음`, async () => {
    const { panel, close } = await launch();
    try {
      await document(panel);
      await panel.evaluate((step) => {
        Reflect.set(window, "uploadPreparationStarted", false);
        if (step === "read") {
          const original = File.prototype.arrayBuffer;
          File.prototype.arrayBuffer = async function () { Reflect.set(window, "uploadPreparationStarted", true); await new Promise<void>((resolve) => Reflect.set(window, "releaseUploadPreparation", resolve)); return original.call(this); };
        } else {
          const original = crypto.subtle.digest.bind(crypto.subtle);
          crypto.subtle.digest = async (...args: Parameters<typeof crypto.subtle.digest>) => { Reflect.set(window, "uploadPreparationStarted", true); await new Promise<void>((resolve) => Reflect.set(window, "releaseUploadPreparation", resolve)); return original(...args); };
        }
      }, stage);
      await submit(panel).click(); await expect.poll(() => panel.evaluate(() => Reflect.get(window, "uploadPreparationStarted"))).toBe(true);
      await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
      await panel.evaluate(() => (Reflect.get(window, "releaseUploadPreparation") as () => void)()); await panel.waitForTimeout(500);
      expect(created).toHaveLength(0); await expect(panel.getByText(/자료를 올렸습니다/u)).toHaveCount(0);
    } finally { await close(); }
  });
  test("참여자 단일 조회·loading/error/retry/empty·종류 전환 폐기", async () => {
    membersMode = "delayedError"; const { panel, close } = await launch();
    try {
      await section(panel).getByRole("button", { name: "음성 파일", exact: true }).click();
      await expect(section(panel).getByText("참여자를 불러오는 중입니다.")).toBeVisible();
      await expect.poll(() => !!releaseMembers).toBe(true); expect(memberRequests).toBe(1);
      if (process.env.SASU_DESKTOP_REACT_MODE === "development") {
        const replay = await panel.evaluate(() => {
          type Hook = { memoizedState: unknown; next: Hook | null };
          type Fiber = { type?: { name?: string }; mode: number; memoizedState: Hook | null; child: Fiber | null; sibling: Fiber | null };
          const find = (fiber: Fiber | null): Fiber | null => !fiber ? null : fiber.type?.name === "WorkReviewUpload" ? fiber : find(fiber.child) ?? find(fiber.sibling);
          const view = find((Reflect.get(window, "uploadReactRoot") as { current: Fiber }).current);
          let cleanupGeneration: number | null = null;
          for (let hook = view?.memoizedState; hook; hook = hook.next) {
            const value = hook.memoizedState as { current?: unknown } | null;
            if (value && typeof value.current === "number") { cleanupGeneration = value.current; break; }
          }
          return { bundleType: Reflect.get(window, "uploadReactBundleType"), strictEffects: !!view && (view.mode & 16) !== 0, cleanupGeneration };
        });
        expect(replay).toEqual({ bundleType: 1, strictEffects: true, cleanupGeneration: 1 });
        console.log("upload_view_actual_strict_replay", replay);
      }
      releaseMembers!(); await expect(section(panel).getByRole("alert")).toContainText("합성 참여자 조회 실패");
      membersMode = "empty"; await section(panel).getByRole("button", { name: "참여자 다시 불러오기" }).click();
      await expect(section(panel).getByText("동의한 참여자가 없습니다.")).toBeVisible();
      membersMode = "delayedError"; releaseMembers = null;
      await section(panel).getByRole("button", { name: "참여자 다시 불러오기" }).click(); await expect.poll(() => !!releaseMembers).toBe(true);
      await section(panel).getByRole("button", { name: "문서 파일", exact: true }).click(); releaseMembers!(); await panel.waitForTimeout(300);
      await expect(section(panel).getByRole("alert")).toHaveCount(0); await expect(panel.getByText("합성 참여자 조회 실패", { exact: true })).toHaveCount(0);
      membersMode = "normal"; await section(panel).getByRole("button", { name: "음성 파일", exact: true }).click();
      await expect(section(panel).getByLabel("합성 참여자", { exact: true })).toBeVisible();
    } finally { releaseMembers?.(); await close(); }
  });
  test("지연 웹 열기 뒤 탭 이탈은 읽음을 시작하지 않는다", async () => {
    const { app, panel, close } = await launch();
    try {
      await document(panel); await submit(panel).click(); await expect(link(panel)).toBeVisible();
      await app.evaluate(() => Reflect.set(globalThis, "uploadOpenMode", "delayed")); await link(panel).click();
      await expect.poll(() => opened(app)).toHaveLength(1); await panel.getByRole("button", { name: "질문", exact: true }).click();
      await app.evaluate(() => (Reflect.get(globalThis, "releaseUploadOpen") as () => void)()); await panel.waitForTimeout(300);
      expect((await panel.evaluate(() => window.sasu.settings.get())).seen).not.toContain(created[0].id);
    } finally { await close(); }
  });
  test("늦은 읽음 오류는 발신 화면 이탈 뒤 notice를 바꾸지 않는다", async () => {
    const { app, panel, close } = await launch();
    try {
      await document(panel); await submit(panel).click(); await expect(link(panel)).toBeVisible();
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler("settings:markSeen"); ipcMain.handle("settings:markSeen", async () => {
          await new Promise<void>((resolve) => Reflect.set(globalThis, "releaseUploadSeen", resolve)); throw new Error("합성 늦은 업로드 읽음 오류");
        });
      });
      await link(panel).click(); await expect.poll(() => app.evaluate(() => !!Reflect.get(globalThis, "releaseUploadSeen"))).toBe(true);
      await panel.getByRole("button", { name: "질문", exact: true }).click();
      await app.evaluate(() => (Reflect.get(globalThis, "releaseUploadSeen") as () => void)()); await panel.waitForTimeout(300);
      await expect(panel.getByText(/합성 늦은 업로드 읽음 오류/u)).toHaveCount(0);
    } finally { await close(); }
  });
  test("합성 음성은 현재 동의 참여자와 기존 WAV 업로드 계약을 유지한다", async () => {
    const { panel, close } = await launch();
    try {
      await section(panel).getByRole("button", { name: "음성 파일", exact: true }).click();
      await expect(section(panel).getByLabel("합성 참여자", { exact: true })).toBeVisible();
      await panel.getByLabel("검토할 파일").setInputFiles({ name: "synthetic.wav", mimeType: "audio/wav", buffer: wav() });
      await section(panel).getByLabel("합성 참여자", { exact: true }).check(); await panel.getByLabel("참여자 동의 확인").check();
      await submit(panel).click(); await expect(link(panel)).toBeVisible();
      expect(created).toHaveLength(1); expect(created[0]).toMatchObject({ kind: "audio", duration: 2, participants: [userId], synthetic: false, consent_confirmed: true });
    } finally { await close(); }
  });
  test("음성 decode 지연 뒤 이탈은 업로드를 시작하지 않는다", async () => {
    const { panel, close } = await launch();
    try {
      await section(panel).getByRole("button", { name: "음성 파일", exact: true }).click();
      await panel.getByLabel("검토할 파일").setInputFiles({ name: "synthetic.wav", mimeType: "audio/wav", buffer: wav() });
      await section(panel).getByLabel("합성 음성입니다.").check(); await panel.getByLabel("참여자 동의 확인").check();
      await panel.evaluate(() => {
        const original = AudioContext.prototype.decodeAudioData;
        AudioContext.prototype.decodeAudioData = async function (bytes: ArrayBuffer) {
          await new Promise<void>((resolve) => Reflect.set(window, "releaseUploadDecode", resolve));
          return original.call(this, bytes);
        };
      });
      await submit(panel).click(); await expect.poll(() => panel.evaluate(() => !!Reflect.get(window, "releaseUploadDecode"))).toBe(true);
      await panel.getByRole("button", { name: "질문", exact: true }).click(); await panel.evaluate(() => (Reflect.get(window, "releaseUploadDecode") as () => void)());
      await panel.waitForTimeout(400); expect(created).toHaveLength(0); await expect(panel.getByText(/자료를 올렸습니다/u)).toHaveCount(0);
    } finally { await close(); }
  });
  test("AudioContext 정리 실패도 접수 결과와 입력 잠금 해제를 보존한다", async () => {
    const { panel, close } = await launch();
    try {
      await section(panel).getByRole("button", { name: "음성 파일", exact: true }).click();
      await panel.getByLabel("검토할 파일").setInputFiles({ name: "synthetic.wav", mimeType: "audio/wav", buffer: wav() });
      await section(panel).getByLabel("합성 음성입니다.").check(); await panel.getByLabel("참여자 동의 확인").check();
      await panel.evaluate(() => { AudioContext.prototype.close = async () => { throw new Error("synthetic_cleanup_failed"); }; });
      await submit(panel).click(); await expect(link(panel)).toBeEnabled();
      await expect(panel.getByLabel("자료 제목")).toBeEnabled();
      expect(created).toHaveLength(1); await expect(panel.getByText(/synthetic_cleanup_failed/u)).toHaveCount(0);
    } finally { await close(); }
  });
});
