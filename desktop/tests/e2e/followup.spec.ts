import { expect, test, _electron as electron } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer, type Server } from "node:https";

// Synthetic HTTPS Auth/API responses exercise the real packaged main/preload/renderer
// without a production session, customer data, database, or model call.
test.describe("desktop followup", () => {
  test.describe.configure({ timeout: 90_000 });
  let fixtureServer: Server;
  let fixtureOrigin: string;
  let tlsDirectory: string;
  let certificatePath: string;
  let linkedBody: unknown;
  const userId = randomUUID();
  const deptId = randomUUID();
  const linkId = randomUUID();
  const answerId = randomUUID();
  let askMode = "accepted";
  let revoked = false;
  let askRequests = 0;
  let previousQuestion = "";
  let currentUserId = userId;
  let askBodies: { question: string; parent_id: string | null }[] = [];
  let historyMode = "normal";
  let historyRequests = 0;
  let releaseHistory: (() => void) | null = null;
  let answerMode = "normal";
  let releaseAnswer: (() => void) | null = null;
  const olderId = randomUUID();
  let contextRole = "member";
  let inboxMode = "normal";
  let releaseInbox: (() => void) | null = null;
  let salesMode = "normal";
  let releaseSales: (() => void) | null = null;
  let salesRequests = 0;
  const reviewId = randomUUID();
  const salesId = randomUUID();
  let workReviews: { id: string; kind: string; title: string; status: string }[] = [];
  let workSales: { id: string; status: string }[] = [];
  let inboxRequests = 0;
  test.beforeEach(() => {
    askMode = "accepted"; revoked = false; askRequests = 0; previousQuestion = ""; currentUserId = userId;
    askBodies = []; historyMode = "normal"; historyRequests = 0; answerMode = "normal";
    releaseHistory = null; releaseAnswer = null;
    contextRole = "member"; inboxMode = "normal"; salesMode = "normal";
    workReviews = []; workSales = []; releaseInbox = null; releaseSales = null; salesRequests = 0; inboxRequests = 0;
  });
  test.beforeAll(async () => {
    // A test-only CA preserves production's HTTPS-only link gate.
    tlsDirectory = mkdtempSync(resolve(tmpdir(), "sasu-desktop-tls-"));
    certificatePath = resolve(tlsDirectory, "certificate.pem");
    const keyPath = resolve(tlsDirectory, "key.pem");
    const bundledOpenSSL = "C:/Program Files/Git/usr/bin/openssl.exe";
    const openssl = process.env.SASU_TEST_OPENSSL ?? (existsSync(bundledOpenSSL) ? bundledOpenSSL : "openssl");
    execFileSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", keyPath, "-out", certificatePath], { stdio: "ignore" });
    const user = { id: userId, aud: "authenticated", role: "authenticated", email: "synthetic@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    const expiresAt = Math.floor(Date.now() / 1_000) + 3_600;
    const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: expiresAt })).toString("base64url")}.${Buffer.from("synthetic-signature").toString("base64url")}`;
    fixtureServer = createServer({ key: readFileSync(keyPath), cert: readFileSync(certificatePath) }, async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const path = new URL(request.url!, "http://localhost").pathname;
      response.setHeader("content-type", "application/json");
      if (path === "/auth/v1/verify") {
        const sessionUser = { ...user, id: currentUserId };
        const sessionToken = currentUserId === userId ? token : `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: currentUserId, exp: expiresAt })).toString("base64url")}.${Buffer.from("synthetic-signature").toString("base64url")}`;
        response.end(JSON.stringify({ access_token: sessionToken, refresh_token: "synthetic-refresh", expires_in: 3_600, expires_at: expiresAt, token_type: "bearer", user: sessionUser }));
      } else if (path === "/auth/v1/user") {
        response.end(JSON.stringify({ ...user, id: currentUserId }));
      } else if (path === "/auth/v1/logout" || path === "/auth/v1/otp") {
        response.end("{}");
      } else if (path === "/api/companion/departments") {
        if (revoked) {
          response.statusCode = 401;
          response.end(JSON.stringify({ code: "session_invalid", error: "기기 로그인이 만료되었습니다." }));
        } else response.end(JSON.stringify({ departments: [{ id: deptId, name: "합성 부서", role: contextRole, consented: true }] }));
      } else if (path === "/api/companion/link" && request.method === "DELETE") {
        response.statusCode = 204;
        response.end();
      } else if (path === "/api/companion/link" && request.method === "POST") {
        linkedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        response.statusCode = 201;
        response.end(JSON.stringify({ link_id: linkId, dept: { id: deptId, name: "합성 부서" }, role: contextRole }));
      } else if (path === "/api/companion/link") {
        response.end(JSON.stringify({ link_id: linkId, dept: { id: deptId, name: "합성 부서" }, role: contextRole, display_name: "합성 팀원" }));
      } else if (path === "/api/companion/inbox") {
        inboxRequests += 1;
        if (inboxMode === "delayed") await new Promise<void>((resolve) => { releaseInbox = resolve; });
        if (revoked) {
          response.statusCode = 401;
          response.end(JSON.stringify({ code: "device_revoked", error: "기기 연결이 해제되었습니다." }));
        } else if (inboxMode === "error") {
          response.statusCode = 503;
          response.end(JSON.stringify({ code: "inbox_failed", error: "최근 작업을 불러오지 못했습니다." }));
        } else response.end(JSON.stringify({ server_time: new Date().toISOString(), cards: [], answers: [], reviews: contextRole === "lead" ? workReviews : [], sales: contextRole === "lead" ? workSales : [] }));
      } else if (path === "/api/companion/sales-review/sources") {
        response.end(JSON.stringify({ candidates: [] }));
      } else if (path === `/api/companion/sales-review/${salesId}`) {
        salesRequests += 1;
        if (salesMode === "delayed") await new Promise<void>((resolve) => { releaseSales = resolve; });
        if (salesMode === "forbidden") {
          response.statusCode = 403;
          response.end(JSON.stringify({ code: "lead_only", error: "팀장만 사용할 수 있습니다." }));
        } else response.end(JSON.stringify({ status: "ready", web_path: `/d/${deptId}/sales-review?task_id=${salesId}` }));
      } else if (path === "/api/companion/ask") {
        askRequests += 1;
        askBodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        if (askMode === "forbidden") {
          await new Promise((resolve) => setTimeout(resolve, 200));
          response.statusCode = 403;
          response.end(JSON.stringify({ code: "ask_parent_forbidden", error: "이 질문을 이어갈 수 없습니다. 새 질문으로 시작해주세요." }));
        } else if (askMode === "offline") {
          response.statusCode = 503;
          response.end(JSON.stringify({ code: "temporarily_unavailable", error: "잠시 후 다시 시도해 주세요." }));
        } else if (askMode === "invalid") response.end(JSON.stringify({ unexpected: true }));
        else {
          previousQuestion = JSON.parse(Buffer.concat(chunks).toString("utf8")).question;
          response.statusCode = 202;
          response.end(JSON.stringify({ answer_id: answerId, job_id: linkId, truncated: false }));
        }
      } else if (path === `/api/companion/answers/${answerId}`) {
        if (answerMode === "pending") {
          response.end(JSON.stringify({ id: answerId, status: "pending", answer: null, refused: false, citations: [] }));
          return;
        }
        if (answerMode === "done") {
          response.end(JSON.stringify({ id: answerId, status: "done", answer: "합성 원칙에 따라 팀장 승인이 필요합니다.", refused: false, citations: [{ quote: "예외는 팀장 승인 후 진행한다.", author: "합성 작성자", source: "합성 부서 원칙", occurred_at: null, href: `${fixtureOrigin}/d/${deptId}/ledger` }] }));
          return;
        }
        if (answerMode === "delayed") await new Promise<void>((resolve) => { releaseAnswer = resolve; });
        if (answerMode === "forbidden") {
          response.statusCode = 403;
          response.end(JSON.stringify({ code: "answer_forbidden", error: "답을 확인할 권한이 없습니다." }));
          return;
        }
        response.end(JSON.stringify({ id: answerId, status: "refused", answer: null, refused: true, citations: [] }));
      } else if (path === "/api/companion/questions") {
        historyRequests += 1;
        if (historyMode === "delayed") await new Promise<void>((resolve) => { releaseHistory = resolve; });
        if (historyMode === "error") {
          response.statusCode = 503;
          response.end(JSON.stringify({ code: "unavailable", error: "질문 기록을 불러오지 못했습니다." }));
        } else {
          const before = new URL(request.url!, fixtureOrigin).searchParams.has("before");
          const first = { id: answerId, question: previousQuestion, status: "refused", created_at: "2026-10-01T12:00:00Z", parent_id: null };
          response.end(JSON.stringify({ questions: before ? [first, { ...first, id: olderId, question: "더 오래된 합성 후속 질문", status: "done", parent_id: answerId }] : previousQuestion ? [first] : [], next: historyMode === "pages" && !before ? { before: first.created_at, before_id: answerId } : null }));
        }
      } else {
        response.statusCode = 404;
        response.end(JSON.stringify({ code: "not_found", error: "합성 경로를 찾지 못했습니다." }));
      }
    });
    await new Promise<void>((resolve) => fixtureServer.listen(0, "127.0.0.1", resolve));
    const address = fixtureServer.address();
    if (!address || typeof address === "string") throw new Error("fixture_address_missing");
    fixtureOrigin = `https://127.0.0.1:${address.port}`;
    execFileSync("cmd.exe", ["/d", "/s", "/c", "npm run build"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SASU_APP_URL: fixtureOrigin,
        SUPABASE_URL: fixtureOrigin,
        SUPABASE_ANON_KEY: "synthetic-public-key",
      },
      stdio: "inherit",
    });
  });
  test.afterAll(async () => {
    fixtureServer?.closeAllConnections();
    if (fixtureServer) await new Promise<void>((resolve, reject) => fixtureServer.close((cause) => cause ? reject(cause) : resolve()));
    if (tlsDirectory) {
      if (!tlsDirectory.startsWith(resolve(tmpdir(), "sasu-desktop-tls-"))) throw new Error("unsafe_tls_path");
      rmSync(tlsDirectory, { recursive: true, force: true });
    }
  });

  async function launch() {
    const userData = mkdtempSync(resolve(tmpdir(), "sasu-desktop-followup-"));
    const app = await electron.launch({
      args: [".", `--user-data-dir=${userData}`],
      executablePath: resolve(process.cwd(), "node_modules/electron/dist/electron.exe"),
      env: { ...process.env, SASU_DISABLE_UPDATER: "1", NODE_EXTRA_CA_CERTS: certificatePath },
    });
    try {
      await app.evaluate(async (_electron, pem) => {
        const tls = process.getBuiltinModule("node:tls") as typeof import("node:tls");
        tls.setDefaultCACertificates([...tls.getCACertificates(), pem]);
      }, readFileSync(certificatePath, "utf8"));
      await app.evaluate(({ session }, pem) => {
        session.defaultSession.setCertificateVerifyProc((request, callback) => {
          callback(request.hostname === "127.0.0.1" && request.certificate.data.trim() === pem.trim() ? 0 : -3);
        });
      }, readFileSync(certificatePath, "utf8"));
      await expect.poll(() => app.windows().some((page) => page.url().includes("#panel")) && app.windows().some((page) => page.url().includes("#pet")), { timeout: 30_000 }).toBe(true);
      const panel = app.windows().find((page) => page.url().includes("#panel"))!;
      const pet = app.windows().find((page) => page.url().includes("#pet"))!;
      await expect(panel.getByRole("heading", { name: "사수 시작하기" })).toBeVisible({ timeout: 30_000 });
      // Rendering may precede main's authorized sender assignment.
      await expect.poll(async () => panel.evaluate(async () => window.sasu.app.info().then(() => true).catch(() => false))).toBe(true);
      return { app, panel, pet, userData };
    } catch (cause) {
      await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      rmSync(userData, { recursive: true, force: true });
      throw cause;
    }
  }

  async function login(panel: Awaited<ReturnType<typeof launch>>["panel"]) {
    await panel.evaluate(async (id) => {
      await window.sasu.auth.verifyCode("synthetic@example.test", "123456");
      await window.sasu.link.create({ dept_id: id });
    }, deptId);
    await panel.reload();
    await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible();
  }

  async function trackWeb(app: Awaited<ReturnType<typeof launch>>["app"], fail = false) {
    await app.evaluate(({ shell }, shouldFail) => {
      Reflect.set(globalThis, "recentWorkOpened", []);
      shell.openExternal = async (url: string) => {
        if (shouldFail) throw new Error("합성 웹 열기 실패");
        (Reflect.get(globalThis, "recentWorkOpened") as string[]).push(url);
      };
    }, fail);
  }
  const webEvents = (app: Awaited<ReturnType<typeof launch>>["app"]) => app.evaluate(() => Reflect.get(globalThis, "recentWorkOpened") as string[]);

  test("최근 작업은 한국어 목록을 다시 열고 성공 후에만 읽음으로 기록한다", async () => {
    contextRole = "lead";
    workReviews = [{ id: reviewId, kind: "document", title: "합성 계약 자료", status: "ready" },
      { id: randomUUID(), kind: "audio", title: "합성 음성 자료", status: "processing" },
      { id: randomUUID(), kind: "document", title: "합성 업로드 자료", status: "uploading" },
      { id: randomUUID(), kind: "document", title: "합성 실패 자료", status: "failed" },
      { id: randomUUID(), kind: "document", title: "합성 취소 자료", status: "cancelled" }];
    workSales = [{ id: salesId, status: "ready" }, { id: randomUUID(), status: "refused" }];
    const { app, panel, userData } = await launch();
    try {
      await trackWeb(app); await login(panel);
      await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
      await expect(panel.getByRole("heading", { name: "최근 맡긴 작업" })).toBeVisible();
      await expect(panel.getByText("최근 24시간")).toBeVisible();
      await expect(panel.getByRole("button", { name: /합성 계약 자료/ })).toBeVisible();
      for (const label of ["검토 중", "업로드 중", "처리 실패", "취소됨", "근거 부족"]) await expect(panel.getByText(label, { exact: true })).toBeVisible();
      await panel.getByRole("button", { name: /합성 계약 자료/ }).evaluate((node) => {
        (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click();
      });
      await expect.poll(async () => (await webEvents(app)).length).toBe(1);
      expect((await webEvents(app))[0]).toBe(`${fixtureOrigin}/d/${deptId}/reviews/${reviewId}`);
      await expect.poll(async () => panel.evaluate(async () => (await window.sasu.settings.get()).seen)).toContain(reviewId);
      await panel.getByRole("button", { name: /영업 원문 검토 1/ }).click();
      await expect.poll(async () => (await webEvents(app)).length).toBe(2);
      expect(salesRequests).toBe(1);
      await panel.getByRole("button", { name: "질문", exact: true }).click();
      await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
      await expect(panel.getByRole("button", { name: /합성 계약 자료/ })).toBeVisible();
      const screenshots = resolve(process.cwd(), "../docs/verification/45-desktop-recent-work/screenshots");
      mkdirSync(screenshots, { recursive: true });
      await panel.screenshot({ path: resolve(screenshots, "recent-work.png") });
    } finally {
      await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      rmSync(userData, { recursive: true, force: true });
    }
  });

  test("최근 작업은 오류 재시도·권한 회수·웹 열기 실패를 빈 목록이나 읽음으로 처리하지 않는다", async () => {
    contextRole = "lead"; inboxMode = "error";
    const { app, panel, userData } = await launch();
    try {
      await trackWeb(app); await login(panel);
      await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
      await expect(panel.getByText(/최근 작업을 불러오지 못했습니다/)).toBeVisible();
      await expect(panel.getByText("최근 맡긴 작업이 없습니다.")).toHaveCount(0);
      inboxMode = "normal";
      await panel.getByRole("button", { name: "작업 새로고침" }).click();
      await expect(panel.getByText("최근 맡긴 작업이 없습니다.")).toBeVisible();
      workReviews = [{ id: reviewId, kind: "document", title: "사라질 합성 자료", status: "ready" }];
      workSales = [{ id: salesId, status: "ready" }];
      await panel.getByRole("button", { name: "작업 새로고침" }).click();
      await expect(panel.getByRole("button", { name: /사라질 합성 자료/ })).toBeVisible();
      workReviews = [];
      await panel.getByRole("button", { name: /사라질 합성 자료/ }).click();
      await expect(panel.getByText("이 자료를 다시 확인할 수 없습니다.")).toBeVisible();
      expect(await webEvents(app)).toEqual([]);
      salesMode = "forbidden";
      await panel.getByRole("button", { name: /영업 원문 검토 1/ }).click();
      await expect(panel.getByText("팀장만 사용할 수 있습니다.")).toBeVisible();
      expect(await panel.evaluate(async () => (await window.sasu.settings.get()).seen)).not.toContain(salesId);
      salesMode = "normal"; await trackWeb(app, true);
      await panel.getByRole("button", { name: /영업 원문 검토 1/ }).click();
      await expect(panel.getByText(/합성 웹 열기 실패/)).toBeVisible();
      expect(await panel.evaluate(async () => (await window.sasu.settings.get()).seen)).not.toContain(salesId);
    } finally {
      await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      rmSync(userData, { recursive: true, force: true });
    }
  });

  test("최근 작업의 늦은 상세 응답은 탭 이탈·로그아웃 뒤 웹과 읽음을 열지 않는다", async () => {
    contextRole = "lead"; workSales = [{ id: salesId, status: "ready" }];
    const { app, panel, userData } = await launch();
    try {
      await trackWeb(app); await login(panel);
      for (const logout of [false, true]) {
        releaseSales = null; salesMode = "delayed";
        await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
        await panel.getByRole("button", { name: /영업 원문 검토 1/ }).click();
        await expect.poll(() => !!releaseSales).toBe(true);
        await panel.getByRole("button", { name: "설정", exact: true }).click();
        if (logout) await panel.getByRole("button", { name: "로그아웃하기" }).click();
        releaseSales!(); salesMode = "normal";
        // Drain the same IPC request before checking absence of side effects.
        await panel.evaluate(async (id) => window.sasu.sales.status(id).catch(() => null), salesId);
        expect(await webEvents(app)).toEqual([]);
        expect(await panel.evaluate(async () => (await window.sasu.settings.get()).seen)).not.toContain(salesId);
      }
      await expect(panel.getByRole("heading", { name: "사수 시작하기" })).toBeVisible();
    } finally {
      releaseSales?.();
      await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      rmSync(userData, { recursive: true, force: true });
    }
  });

  test("최근 작업 새로고침은 30초 갱신과 공유하고 팀원에게 목록을 표시하지 않는다", async () => {
    contextRole = "lead"; workReviews = [{ id: reviewId, kind: "document", title: "공유 갱신 합성 자료", status: "processing" }];
    const { app, panel, userData } = await launch();
    try {
      await login(panel);
      await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
      await expect(panel.getByRole("button", { name: /공유 갱신 합성 자료/ })).toBeVisible();
      await panel.clock.install();
      inboxMode = "delayed";
      await panel.getByRole("button", { name: "작업 새로고침" }).click();
      await expect.poll(() => !!releaseInbox).toBe(true);
      const started = inboxRequests;
      await expect(panel.getByText("최근 작업을 불러오는 중입니다.")).toBeVisible();
      await expect(panel.getByRole("button", { name: "작업 새로고침" })).toBeDisabled();
      await panel.clock.runFor(30_000);
      expect(inboxRequests).toBe(started);
      releaseInbox!(); inboxMode = "normal";
      await expect(panel.getByText("최근 작업을 불러오는 중입니다.")).toHaveCount(0);
      await panel.getByRole("button", { name: "설정", exact: true }).click();
      await panel.getByRole("button", { name: "로그아웃하기" }).click();
      contextRole = "member"; await login(panel);
      await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
      await expect(panel.getByText("팀장만 사용할 수 있어요.")).toBeVisible();
      await expect(panel.getByRole("heading", { name: "최근 맡긴 작업" })).toHaveCount(0);
    } finally {
      releaseInbox?.();
      await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      rmSync(userData, { recursive: true, force: true });
    }
  });

  test("최근 작업 읽음 저장의 늦은 오류는 떠난 화면에 표시하지 않는다", async () => {
    contextRole = "lead"; workSales = [{ id: salesId, status: "ready" }];
    const { app, panel, userData } = await launch();
    try {
      await trackWeb(app); await login(panel);
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler("settings:markSeen");
        ipcMain.handle("settings:markSeen", async () => {
          await new Promise<void>((resolve) => Reflect.set(globalThis, "releaseSeenFailure", resolve));
          throw new Error("합성 읽음 저장 실패");
        });
      });
      for (const leave of [false, true]) {
        await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
        await app.evaluate(() => Reflect.set(globalThis, "releaseSeenFailure", null));
        await panel.getByRole("button", { name: /영업 원문 검토 1/ }).click();
        await expect.poll(() => app.evaluate(() => !!Reflect.get(globalThis, "releaseSeenFailure"))).toBe(true);
        if (leave) await panel.getByRole("button", { name: "질문", exact: true }).click();
        await app.evaluate(() => (Reflect.get(globalThis, "releaseSeenFailure") as () => void)());
        if (leave) {
          await panel.evaluate(async () => { await window.sasu.app.info(); await window.sasu.app.info(); });
          await expect(panel.getByText(/합성 읽음 저장 실패/)).toHaveCount(0);
        } else await expect(panel.getByText(/합성 읽음 저장 실패/)).toBeVisible();
      }
      expect((await webEvents(app)).length).toBe(2);
      expect(await panel.evaluate(async () => (await window.sasu.settings.get()).seen)).not.toContain(salesId);
    } finally {
      await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      rmSync(userData, { recursive: true, force: true });
    }
  });

  test("최근 자료의 늦은 목록 재확인은 탭 이탈·로그아웃 뒤 열지 않는다", async () => {
    contextRole = "lead"; workReviews = [{ id: reviewId, kind: "document", title: "늦은 합성 자료", status: "ready" }];
    const { app, panel, userData } = await launch();
    try {
      await trackWeb(app); await login(panel);
      for (const logout of [false, true]) {
        releaseInbox = null; inboxMode = "delayed";
        await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
        await panel.getByRole("button", { name: /늦은 합성 자료/ }).click();
        await expect.poll(() => !!releaseInbox).toBe(true);
        await panel.getByRole("button", { name: "설정", exact: true }).click();
        if (logout) await panel.getByRole("button", { name: "로그아웃하기" }).click();
        inboxMode = "normal"; releaseInbox!();
        await panel.evaluate(async () => window.sasu.inbox.get().catch(() => null));
        expect(await webEvents(app)).toEqual([]);
        expect(await panel.evaluate(async () => (await window.sasu.settings.get()).seen)).not.toContain(reviewId);
      }
    } finally {
      releaseInbox?.();
      await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      rmSync(userData, { recursive: true, force: true });
    }
  });

  test("질문 이력에서 이어 묻기와 새 질문 전환은 부모와 초안을 보존한다", async () => {
    previousQuestion = "합성 이전 질문의 승인 기준은 무엇인가요?";
    const original = previousQuestion;
    const { app, panel, userData } = await launch();
    try {
      await login(panel);
      await panel.getByRole("button", { name: "기록", exact: true }).click();
      await expect(panel.getByRole("button", { name: new RegExp(original) })).toBeVisible();
      expect(historyRequests).toBe(1);
      await panel.getByRole("button", { name: new RegExp(original) }).click();
      await expect(panel.getByText(original, { exact: true })).toBeVisible();
      await panel.getByRole("button", { name: "이어 묻기", exact: true }).click();
      await expect(panel.getByPlaceholder("질문을 적어 주세요.")).toBeFocused();
      const draft = "승인 기준에서 예외는 어떻게 판단하나요?";
      await panel.getByPlaceholder("질문을 적어 주세요.").fill(draft);
      askMode = "forbidden";
      await panel.getByRole("button", { name: "질문하기", exact: true }).dblclick();
      await expect(panel.getByText(/이 질문을 이어갈 수 없습니다/)).toBeVisible();
      expect(askBodies).toEqual([{ question: draft, parent_id: answerId }]);
      await expect(panel.getByPlaceholder("질문을 적어 주세요.")).toHaveValue(draft);
      await expect(panel.getByText("이 질문에 이어 묻습니다.")).toBeVisible();
      const screenshots = resolve(process.cwd(), "../docs/verification/44-desktop-question-followup/screenshots");
      mkdirSync(screenshots, { recursive: true });
      await panel.screenshot({ path: resolve(screenshots, "followup-forbidden.png") });
      askMode = "accepted";
      await panel.getByRole("button", { name: "질문하기", exact: true }).click();
      await expect(panel.getByText("근거가 부족해 답하지 못했습니다.")).toBeVisible();
      expect(askBodies[1]).toEqual({ question: draft, parent_id: answerId });
      await panel.getByRole("button", { name: "이어 묻기", exact: true }).click();
      await panel.getByPlaceholder("질문을 적어 주세요.").fill("이번에는 별개의 새 질문입니다.");
      await panel.getByRole("button", { name: "새 질문으로 시작" }).click();
      await expect(panel.getByPlaceholder("질문을 적어 주세요.")).toHaveValue("이번에는 별개의 새 질문입니다.");
      await expect(panel.getByText("이 질문에 이어 묻습니다.")).toHaveCount(0);
      await panel.getByRole("button", { name: "질문하기", exact: true }).click();
      await expect.poll(() => askBodies.length).toBe(3);
      expect(askBodies[2].parent_id).toBeNull();
    } finally {
      await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      rmSync(userData, { recursive: true, force: true });
    }
  });

  test("질문 이력은 오류 재시도·빈 상태·중복 없는 페이지와 현재 권한을 표시한다", async () => {
    historyMode = "error";
    const { app, panel, userData } = await launch();
    try {
      await login(panel);
      await panel.getByRole("button", { name: "기록", exact: true }).click();
      await expect(panel.getByText("질문 기록을 불러오지 못했습니다.")).toBeVisible();
      await expect(panel.getByText("아직 질문 기록이 없습니다.")).toHaveCount(0);
      historyMode = "normal";
      await panel.getByRole("button", { name: "기록 불러오기" }).click();
      await expect(panel.getByText("아직 질문 기록이 없습니다.")).toBeVisible();
      historyMode = "pages"; previousQuestion = "다시 여는 합성 질문입니다.";
      await panel.getByRole("button", { name: "기록 불러오기" }).click();
      await expect(panel.getByText(/근거 부족/)).toBeVisible();
      await panel.getByRole("button", { name: "더 보기" }).click();
      await expect(panel.getByRole("button", { name: /더 오래된 합성 후속 질문/ })).toBeVisible();
      await expect(panel.getByRole("button", { name: /다시 여는 합성 질문입니다/ })).toHaveCount(1);
      await expect(panel.getByRole("button", { name: "더 보기" })).toHaveCount(0);
      answerMode = "forbidden";
      await panel.getByRole("button", { name: /다시 여는 합성 질문입니다/ }).click();
      await expect(panel.getByText(/답을 확인할 권한이 없습니다/)).toBeVisible();
      await expect(panel.getByRole("heading", { name: "지난 질문" })).toBeVisible();
    } finally {
      await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      rmSync(userData, { recursive: true, force: true });
    }
  });

  test("새 질문 실패 후 이전 답의 취소된 폴링은 기록 안내로 끝난다", async () => {
    answerMode = "pending";
    const { app, panel, userData } = await launch();
    try {
      await login(panel);
      await panel.getByPlaceholder("질문을 적어 주세요.").fill("아직 처리 중인 첫 번째 합성 질문");
      await panel.getByRole("button", { name: "질문하기", exact: true }).click();
      await expect(panel.getByText("답을 찾는 중입니다.")).toBeVisible();
      askMode = "forbidden";
      await panel.getByPlaceholder("질문을 적어 주세요.").fill("실패하는 두 번째 합성 질문입니다.");
      await panel.getByRole("button", { name: "질문하기", exact: true }).click();
      await expect(panel.getByText(/이 질문을 이어갈 수 없습니다/)).toBeVisible();
      await expect(panel.getByText("답 확인을 멈췄습니다. 기록에서 다시 확인해 주세요.")).toBeVisible();
      await expect(panel.getByText("답을 찾는 중입니다.")).toHaveCount(0);
      await expect(panel.getByPlaceholder("질문을 적어 주세요.")).toHaveValue("실패하는 두 번째 합성 질문입니다.");
    } finally {
      await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      rmSync(userData, { recursive: true, force: true });
    }
  });

  test("완료 답의 인용을 열고 오프라인으로 이어 묻기 후 부모를 유지해 전송한다", async () => {
    answerMode = "done"; previousQuestion = "완료된 합성 질문의 예외 승인 기준";
    const { app, panel, userData } = await launch();
    try {
      await login(panel);
      await panel.getByRole("button", { name: "기록", exact: true }).click();
      await panel.getByRole("button", { name: /완료된 합성 질문/ }).click();
      await expect(panel.getByText("합성 원칙에 따라 팀장 승인이 필요합니다.")).toBeVisible();
      await expect(panel.getByText("예외는 팀장 승인 후 진행한다.")).toBeVisible();
      await panel.getByRole("button", { name: "이어 묻기", exact: true }).click();
      const draft = "오프라인에서 이어 묻는 합성 예외 승인 질문";
      await panel.getByPlaceholder("질문을 적어 주세요.").fill(draft);
      askMode = "offline";
      await panel.getByRole("button", { name: "질문하기", exact: true }).click();
      await expect(panel.getByText("연결되면 보낼게요.")).toBeVisible();
      await expect(panel.getByPlaceholder("질문을 적어 주세요.")).toHaveValue("");
      await expect(panel.getByText("이 질문에 이어 묻습니다.")).toHaveCount(0);
      const outbox = resolve(userData, "outbox.bin");
      expect(readFileSync(outbox).includes(Buffer.from(draft))).toBe(false);
      const postsBeforeReconnect = askBodies.length;
      askMode = "accepted";
      await panel.evaluate(async () => window.sasu.inbox.get());
      await expect.poll(() => askBodies.length).toBe(postsBeforeReconnect + 1);
      expect(askBodies.at(-1)).toEqual({ question: draft, parent_id: answerId });
      expect(askBodies.every((body) => body.parent_id === answerId)).toBe(true);
    } finally {
      await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      rmSync(userData, { recursive: true, force: true });
    }
  });

  test("질문 이력의 늦은 목록과 상세 응답은 떠난 화면을 바꾸지 않는다", async () => {
    historyMode = "delayed"; previousQuestion = "늦게 도착하는 합성 질문입니다.";
    const { app, panel, userData } = await launch();
    try {
      await login(panel);
      await panel.getByRole("button", { name: "기록", exact: true }).click();
      await expect.poll(() => !!releaseHistory).toBe(true);
      await panel.getByRole("button", { name: "질문", exact: true }).click();
      releaseHistory!(); historyMode = "normal";
      await panel.getByRole("button", { name: "기록", exact: true }).click();
      await expect(panel.getByRole("button", { name: /늦게 도착하는 합성 질문/ })).toBeVisible();
      answerMode = "delayed";
      await panel.getByRole("button", { name: /늦게 도착하는 합성 질문/ }).click();
      await expect.poll(() => !!releaseAnswer).toBe(true);
      await panel.getByRole("button", { name: "설정", exact: true }).click();
      releaseAnswer!();
      await expect(panel.getByRole("button", { name: "로그아웃하기" })).toBeVisible();
      await panel.getByRole("button", { name: "질문", exact: true }).click();
      await expect(panel.getByText("근거가 부족해 답하지 못했습니다.")).toHaveCount(0);
    } finally {
      releaseHistory?.(); releaseAnswer?.();
      await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      rmSync(userData, { recursive: true, force: true });
    }
  });

  for (const reason of ["설정 로그아웃", "서버 401"] as const) {
    test(`${reason} 뒤 재로그인에 이전 답·기록·설정을 남기지 않는다`, async () => {
      const { app, panel, pet, userData } = await launch();
      try {
        await panel.evaluate(async (id) => {
          await window.sasu.auth.verifyCode("synthetic@example.test", "123456");
          await window.sasu.link.create({ dept_id: id });
        }, deptId);
        await panel.reload();
        await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible();
        await panel.getByPlaceholder("질문을 적어 주세요.").fill("이전 사용자의 합성 질문 기록입니다.");
        await panel.getByRole("button", { name: "질문하기" }).click();
        await expect(panel.getByText("근거가 부족해 답하지 못했습니다.")).toBeVisible();
        await panel.getByRole("button", { name: "기록", exact: true }).click();
        await panel.getByRole("button", { name: "기록 불러오기" }).click();
        await expect(panel.getByText("이전 사용자의 합성 질문 기록입니다.")).toBeVisible();
        await panel.evaluate(async () => window.sasu.settings.set({ pet: "purple", panelPinned: true }));
        if (reason === "설정 로그아웃") {
          await panel.getByRole("button", { name: "설정", exact: true }).click();
          await panel.getByRole("button", { name: "로그아웃하기" }).click();
        } else {
          revoked = true;
          await expect(panel.evaluate(async () => window.sasu.inbox.get())).rejects.toThrow("device_revoked");
        }
        await expect(panel.getByRole("heading", { name: "사수 시작하기" })).toBeVisible();
        await expect.poll(() => existsSync(resolve(userData, "session.bin"))).toBe(false);
        await expect.poll(() => existsSync(resolve(userData, "outbox.bin"))).toBe(false);
        await expect.poll(() => existsSync(resolve(userData, "settings.bin"))).toBe(false);
        expect((await pet.evaluate(async () => window.sasu.settings.get())).pet).toBe("green");
        const screenshots = resolve(process.cwd(), "../docs/verification/43-desktop-companion/screenshots");
        mkdirSync(screenshots, { recursive: true });
        await panel.screenshot({ path: resolve(screenshots, reason === "설정 로그아웃" ? "desktop-session-logout.png" : "desktop-session-401.png") });

        revoked = false; previousQuestion = ""; currentUserId = randomUUID();
        await panel.getByLabel("이메일").fill("synthetic-next@example.test");
        await panel.getByRole("button", { name: "코드 받기" }).click();
        await expect(panel.getByText("로그인 코드를 보냈습니다.")).toBeVisible();
        await panel.getByLabel("6자리 코드").fill("123456");
        await panel.getByRole("button", { name: "로그인하기" }).click();
        await panel.getByRole("button", { name: "합성 부서", exact: true }).click();
        await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible();
        await expect(panel.getByText("근거가 부족해 답하지 못했습니다.")).toHaveCount(0);
        await panel.getByRole("button", { name: "기록", exact: true }).click();
        await expect(panel.getByText("이전 사용자의 합성 질문 기록입니다.")).toHaveCount(0);
        expect(await panel.evaluate(async () => window.sasu.settings.get())).toMatchObject({ seen: [], pet: "green", panelPinned: false });
      } finally {
        await app.close();
        rmSync(userData, { recursive: true, force: true });
      }
    });
  }

  test("부서 연결 대기 중 현재 세대 401도 세션을 종료한다", async () => {
    const { app, panel, userData } = await launch();
    try {
      await panel.evaluate(async () => window.sasu.auth.verifyCode("synthetic@example.test", "123456"));
      expect(existsSync(resolve(userData, "session.bin"))).toBe(true);
      revoked = true;
      await expect(panel.evaluate(async () => window.sasu.link.departments())).rejects.toThrow("session_invalid");
      await expect(panel.getByRole("heading", { name: "사수 시작하기" })).toBeVisible();
      await expect.poll(() => existsSync(resolve(userData, "session.bin"))).toBe(false);
      expect((await panel.evaluate(async () => window.sasu.settings.get())).seen).toEqual([]);
    } finally {
      await app.close();
      rmSync(userData, { recursive: true, force: true });
    }
  });

  test("실제 본체의 동시 오프라인 보관과 응답 오류 재전송 금지", async () => {
    const { app, panel, userData } = await launch();
    try {
      await panel.evaluate(async (id) => {
        await window.sasu.auth.verifyCode("synthetic@example.test", "123456");
        await window.sasu.link.create({ dept_id: id });
      }, deptId);
      askMode = "offline";
      const results = await panel.evaluate(async () => Promise.all([
        window.sasu.ask.send("첫 번째 오프라인 합성 질문입니다."),
        window.sasu.ask.send("두 번째 오프라인 합성 질문입니다."),
      ]));
      expect(results.every((result) => "queued" in result)).toBe(true);
      expect((await panel.evaluate(async () => window.sasu.inbox.get())).outbox_count).toBe(2);
      const encrypted = readFileSync(resolve(userData, "outbox.bin"));
      expect(encrypted.includes(Buffer.from("오프라인 합성 질문"))).toBe(false);
      await panel.evaluate(async () => window.sasu.auth.signOut());
      expect(existsSync(resolve(userData, "outbox.bin"))).toBe(false);
      await panel.evaluate(async (id) => {
        await window.sasu.auth.verifyCode("synthetic@example.test", "123456");
        await window.sasu.link.create({ dept_id: id });
      }, deptId);
      askMode = "invalid";
      const previousRequests = askRequests;
      await expect(panel.evaluate(async () => window.sasu.ask.send("응답 형식 오류 합성 질문입니다."))).rejects.toThrow("invalid_response");
      expect((await panel.evaluate(async () => window.sasu.inbox.get())).outbox_count).toBe(0);
      expect(askRequests - previousRequests).toBe(1);
    } finally {
      await app.close();
      rmSync(userData, { recursive: true, force: true });
    }
  });

  test("실제 암호화 설정의 동시 열람·위치·선호와 IPC 제한", async () => {
    const { app, panel, pet, userData } = await launch();
    try {
      const ids = [randomUUID(), randomUUID()];
      await panel.evaluate(async ([first, second]) => {
        await Promise.all([
          window.sasu.settings.markSeen(first!),
          window.sasu.settings.markSeen(second!),
          window.sasu.settings.set({ pet: "purple", panelPinned: true }),
        ]);
      }, ids);
      await pet.evaluate(async () => window.sasu.window.movePet({ x: 320, y: 380 }));
      const settings = await panel.evaluate(async () => window.sasu.settings.get());
      expect(settings.seen).toEqual(ids);
      expect(settings.pet).toBe("purple");
      expect(settings.petPosition).toEqual({ x: 320, y: 380 });
      await expect(panel.evaluate(async () => window.sasu.settings.set({ seen: [] } as never))).rejects.toThrow("invalid_input");
      await expect(pet.evaluate(async (id) => window.sasu.settings.markSeen(id), ids[0]!)).rejects.toThrow("window_forbidden");
      expect((await panel.evaluate(async () => window.sasu.settings.get())).seen).toEqual(ids);
      const encrypted = readFileSync(resolve(userData, "settings.bin"));
      expect(ids.every((id) => !encrypted.includes(Buffer.from(id)))).toBe(true);
      await panel.reload();
      expect((await panel.evaluate(async () => window.sasu.settings.get())).seen).toEqual(ids);
    } finally {
      await app.close();
      rmSync(userData, { recursive: true, force: true });
    }
  });

  test("폴링 실패 안내·화면 이동 뒤 취소·완료 답 열람 보존", async () => {
    const { app, panel, userData } = await launch();
    try {
      const answerId = randomUUID();
      const readId = randomUUID();
      await app.evaluate(({ ipcMain }, id) => {
        const replace = (name: string, handler: () => unknown) => {
          ipcMain.removeHandler(name); ipcMain.handle(name, handler);
        };
        replace("link:get", () => ({ dept: { id, name: "합성 부서" }, role: "member" }));
        replace("inbox:get", () => ({ inbox: { cards: [], answers: [], reviews: [], sales: [] }, outbox_count: 0 }));
        replace("ask:send", () => ({ answer_id: id, job_id: id, truncated: false }));
        replace("answer:get", () => { throw new Error("network:연결을 확인해 주세요."); });
      }, answerId);
      await panel.reload();
      await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible();
      await panel.evaluate(async () => window.sasu.settings.set({ panelPinned: true }));
      await panel.getByPlaceholder("질문을 적어 주세요.").fill("합성 질문의 답변을 확인해 주세요.");
      await panel.getByRole("button", { name: "질문하기" }).click();
      await expect(panel.getByText(/연결을 확인해 주세요.*기록에서 답/u)).toBeVisible();
      await expect(panel.getByText("답 확인을 멈췄습니다. 기록에서 다시 확인해 주세요.")).toBeVisible();
      await expect(panel.getByText(/network|Error:|answer:get/u)).toHaveCount(0);
      const screenshots = resolve(process.cwd(), "../docs/verification/43-desktop-companion/screenshots");
      mkdirSync(screenshots, { recursive: true });
      await panel.screenshot({ path: resolve(screenshots, "desktop-followup-poll-error.png") });

      await app.evaluate(({ ipcMain }, id) => {
        const state = globalThis as typeof globalThis & { followupPollCalls?: number };
        state.followupPollCalls = 0;
        ipcMain.removeHandler("answer:get");
        ipcMain.handle("answer:get", () => {
          state.followupPollCalls! += 1;
          return { id, status: "pending", answer: null, refused: false, citations: [] };
        });
      }, answerId);
      await panel.getByPlaceholder("질문을 적어 주세요.").fill("다음 합성 질문의 답변을 확인해 주세요.");
      await panel.getByRole("button", { name: "질문하기" }).click();
      await expect(panel.getByText("답을 찾는 중입니다.")).toBeVisible();
      expect((await panel.evaluate(async () => window.sasu.settings.get())).seen).not.toContain(answerId);
      await panel.getByRole("button", { name: "설정", exact: true }).click();
      await expect(panel.getByRole("heading", { name: "설정", exact: true })).toBeVisible();
      await panel.evaluate(async (id) => window.sasu.settings.markSeen(id), readId);
      const calls = await app.evaluate(() => (globalThis as typeof globalThis & { followupPollCalls?: number }).followupPollCalls);
      await panel.waitForTimeout(2_200);
      expect(await app.evaluate(() => (globalThis as typeof globalThis & { followupPollCalls?: number }).followupPollCalls)).toBe(calls);
      await app.evaluate(({ ipcMain }, id) => {
        ipcMain.removeHandler("answer:get");
        ipcMain.handle("answer:get", () => ({ id, status: "refused", answer: null, refused: true, citations: [] }));
      }, answerId);
      await panel.getByRole("button", { name: "질문", exact: true }).click();
      await expect(panel.getByText("답 확인을 멈췄습니다. 기록에서 다시 확인해 주세요.")).toBeVisible();
      await expect(panel.getByText("답을 찾는 중입니다.")).toHaveCount(0);
      await panel.getByPlaceholder("질문을 적어 주세요.").fill("완료 합성 질문의 답변을 확인해 주세요.");
      await panel.getByRole("button", { name: "질문하기" }).click();
      await expect(panel.getByText("근거가 부족해 답하지 못했습니다.")).toBeVisible();
      await expect.poll(async () => (await panel.evaluate(async () => window.sasu.settings.get())).seen).toEqual([readId, answerId]);
    } finally {
      await app.close();
      rmSync(userData, { recursive: true, force: true });
    }
  });

  test("실제 본체 hostname을 기존 E02 요청과 앱 정보에 같이 사용한다", async () => {
    const { app, panel, userData } = await launch();
    try {
      linkedBody = null;
      await panel.evaluate(async () => window.sasu.auth.verifyCode("synthetic@example.test", "123456"));
      const info = await panel.evaluate(async () => window.sasu.app.info());
      await panel.evaluate(async (id) => window.sasu.link.create({ dept_id: id }), deptId);
      expect(linkedBody).toEqual({ dept_id: deptId, device_name: info.device_name, app_version: info.version });
      expect(info.device_name.length).toBeGreaterThan(0);
      expect(info.device_name.length).toBeLessThanOrEqual(60);
      expect(info.device_name).not.toBe("데스크톱 앱");
    } finally {
      await app.close();
      rmSync(userData, { recursive: true, force: true });
    }
  });
});
