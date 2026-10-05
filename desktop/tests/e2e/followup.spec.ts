import { expect, test, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
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
  let historyUrls: string[] = [];
  let historyResponses = 0;
  let releaseHistory: (() => void) | null = null;
  let answerMode = "normal";
  let answerRequests = 0;
  let answerResponses = 0;
  let releaseAnswer: (() => void) | null = null;
  const olderId = randomUUID();
  let contextRole = "member";
  let inboxMode = "normal";
  let releaseInbox: (() => void) | null = null;
  let salesMode = "normal";
  let salesState = "ready";
  let releaseSales: (() => void) | null = null;
  let salesRequests = 0;
  let sourceMode = "normal";
  let sourceRequests = 0;
  let releaseSources: (() => void) | null = null;
  let startMode = "normal";
  let releaseStart: (() => void) | null = null;
  let startBodies: Record<string, string>[] = [];
  const sourceIds = Array.from({ length: 5 }, () => randomUUID());
  let sourceCandidates: { item_id: string; title: string; kind: string; quote: string; is_principles: boolean }[] = [];
  const reviewId = randomUUID();
  const salesId = randomUUID();
  let workReviews: { id: string; kind: string; title: string; status: string }[] = [];
  let workSales: { id: string; status: string }[] = [];
  let inboxRequests = 0;
  const cardId = randomUUID();
  let decisionCards: { id: string; title: string; deadline: string | null; status: string }[] = [];
  let cardMode = "normal";
  let cardStatus = "open";
  let cardRequests = 0;
  let releaseCard: (() => void) | null = null;
  let decideMode = "normal";
  let releaseDecision: (() => void) | null = null;
  let decisionBodies: { status: string; outcome: string; rationale: string }[] = [];
  const ownedApps = new WeakMap<Page, ElectronApplication>();
  test.beforeEach(() => {
    askMode = "accepted"; revoked = false; askRequests = 0; previousQuestion = ""; currentUserId = userId;
    askBodies = []; historyMode = "normal"; historyRequests = 0; answerMode = "normal";
    historyUrls = []; historyResponses = 0; answerRequests = 0; answerResponses = 0;
    releaseHistory = null; releaseAnswer = null;
    contextRole = "member"; inboxMode = "normal"; salesMode = "normal"; salesState = "ready";
    workReviews = []; workSales = []; releaseInbox = null; releaseSales = null; salesRequests = 0; inboxRequests = 0;
    decisionCards = []; cardMode = "normal"; cardStatus = "open"; cardRequests = 0;
    releaseCard = null; decideMode = "normal"; releaseDecision = null; decisionBodies = [];
    sourceMode = "normal"; sourceRequests = 0; releaseSources = null;
    startMode = "normal"; releaseStart = null; startBodies = []; sourceCandidates = [];
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
        const capturedCards = structuredClone(decisionCards);
        if (inboxMode === "delayed") await new Promise<void>((resolve) => { releaseInbox = resolve; });
        if (revoked) {
          response.statusCode = 401;
          response.end(JSON.stringify({ code: "device_revoked", error: "기기 연결이 해제되었습니다." }));
        } else if (inboxMode === "error") {
          response.statusCode = 503;
          response.end(JSON.stringify({ code: "inbox_failed", error: "최근 작업을 불러오지 못했습니다." }));
        } else response.end(JSON.stringify({ server_time: new Date().toISOString(), cards: capturedCards, answers: [], reviews: contextRole === "lead" ? workReviews : [], sales: contextRole === "lead" ? workSales : [] }));
      } else if (path === `/api/companion/cards/${cardId}`) {
        cardRequests += 1;
        if (cardMode === "delayed") await new Promise<void>((resolve) => { releaseCard = resolve; });
        if (cardMode === "forbidden") {
          response.statusCode = 403;
          response.end(JSON.stringify({ code: "card_forbidden", error: "이 카드를 확인할 수 없습니다." }));
        } else response.end(JSON.stringify({
          card: { id: cardId, dept_id: deptId, title: "합성 승인 카드", background: "합성 요청의 승인 조건을 확인합니다.", recommendation: "합성 원칙의 승인을 확인하세요.", deadline: null, assignee_id: userId, status: cardStatus, visibility: "dept" },
          citations: cardMode === "noCitations" ? [] : [{ quote: "예외는 팀장 승인 후 진행한다.", author: "합성 작성자", occurredAt: null, source: "합성 부서 원칙", href: `/d/${deptId}/ledger`, lowConfidence: false, boundaryReview: false }],
          conflicts: [], decisions: [],
        }));
      } else if (path === `/api/companion/cards/${cardId}/decide`) {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        decisionBodies.push(body);
        if (decideMode.startsWith("delayed")) await new Promise<void>((resolve) => { releaseDecision = resolve; });
        if (["conflict", "forbidden", "offline", "delayedError"].includes(decideMode)) {
          response.statusCode = decideMode === "forbidden" ? 403 : decideMode === "conflict" ? 409 : 503;
          response.end(JSON.stringify({ code: "decision_failed", error: "합성 결정을 처리하지 못했습니다. 다시 확인해 주세요." }));
        } else {
          cardStatus = decideMode === "duplicate" ? "decided" : body.status;
          decisionCards = [];
          response.end(JSON.stringify({ ok: true, duplicate: decideMode === "duplicate", status: cardStatus, message: decideMode === "duplicate" ? "이미 합성 팀장이 결정했습니다." : "합성 카드 처리를 마쳤습니다." }));
        }
      } else if (path === "/api/companion/sales-review/sources") {
        sourceRequests += 1;
        const delayedLead = sourceMode === "delayedLead";
        if (sourceMode.startsWith("delayed")) await new Promise<void>((resolve) => { releaseSources = resolve; });
        const sourceCode = delayedLead ? "lead_only" : sourceMode;
        if (sourceCode === "network") { response.destroy(); return; }
        if (sourceCode !== "normal" && sourceCode !== "delayed") {
          response.statusCode = sourceCode === "error" ? 503 : 403;
          response.end(JSON.stringify({ code: sourceCode, error: "합성 자료 목록을 불러오지 못했습니다." }));
        } else response.end(JSON.stringify({ candidates: sourceCandidates }));
      } else if (path === "/api/companion/sales-review" && request.method === "POST") {
        startBodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        if (startMode === "network") { response.destroy(); return; }
        if (startMode.startsWith("delayed")) await new Promise<void>((resolve) => { releaseStart = resolve; });
        if (!["normal", "delayed"].includes(startMode)) {
          response.statusCode = startMode === "source_unavailable" ? 404 : startMode === "error" || startMode === "delayedError" ? 503 : 403;
          response.end(JSON.stringify({ code: startMode, error: "합성 검토 시작을 처리하지 못했습니다." }));
        } else { response.statusCode = 202; response.end(JSON.stringify({ task_id: salesId })); }
      } else if (path === `/api/companion/sales-review/${salesId}`) {
        salesRequests += 1;
        const capturedMode = salesMode;
        const capturedState = salesState;
        if (capturedMode.startsWith("delayed")) await new Promise<void>((resolve) => { releaseSales = resolve; });
        if (capturedMode === "network") { response.destroy(); return; }
        if (["forbidden", "error", "not_found", "delayedError"].includes(capturedMode)) {
          response.statusCode = capturedMode === "not_found" ? 404 : capturedMode === "forbidden" ? 403 : 503;
          response.end(JSON.stringify({ code: capturedMode === "forbidden" ? "lead_only" : capturedMode, error: capturedMode === "forbidden" ? "팀장만 사용할 수 있습니다." : "합성 검토 상태를 확인하지 못했습니다." }));
        } else response.end(JSON.stringify({ status: capturedState, web_path: `/d/${deptId}/sales-review?task_id=${salesId}` }));
      } else if (path === "/api/companion/ask") {
        askRequests += 1;
        askBodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        if (askMode === "forbidden") {
          await new Promise((resolve) => setTimeout(resolve, 200));
          response.statusCode = 403;
          response.end(JSON.stringify({ code: "ask_parent_forbidden", error: "이 질문을 이어갈 수 없습니다. 새 질문으로 시작해주세요." }));
        } else if (askMode === "limit") {
          response.statusCode = 429;
          response.end(JSON.stringify({ code: "ask_daily_limit", error: "오늘 질문 한도를 모두 사용했습니다." }));
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
        answerRequests += 1;
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
        answerResponses += 1;
      } else if (path === "/api/companion/questions") {
        historyRequests += 1;
        historyUrls.push(request.url!);
        // Snapshot at request time: a released old-session response must carry
        // old-session content even after the fixture has switched users.
        const requestedQuestion = previousQuestion;
        const before = new URL(request.url!, fixtureOrigin).searchParams.has("before");
        if (historyMode === "delayed") await new Promise<void>((resolve) => { releaseHistory = resolve; });
        if (historyMode === "error" || (historyMode === "page-error" && before)) {
          response.statusCode = 503;
          response.end(JSON.stringify({ code: "unavailable", error: "질문 기록을 불러오지 못했습니다." }));
        } else {
          const first = { id: answerId, question: requestedQuestion, status: "refused", created_at: "2026-10-01T12:00:00Z", parent_id: null };
          response.end(JSON.stringify({ questions: before ? [first, { ...first, id: olderId, question: "더 오래된 합성 후속 질문", status: "done", parent_id: answerId }] : requestedQuestion ? [first] : [], next: ["pages", "page-error"].includes(historyMode) && !before ? { before: first.created_at, before_id: answerId } : null }));
        }
        historyResponses += 1;
      } else {
        response.statusCode = 404;
        response.end(JSON.stringify({ code: "not_found", error: "합성 경로를 찾지 못했습니다." }));
      }
    });
    await new Promise<void>((resolve) => fixtureServer.listen(0, "127.0.0.1", resolve));
    const address = fixtureServer.address();
    if (!address || typeof address === "string") throw new Error("fixture_address_missing");
    fixtureOrigin = `https://127.0.0.1:${address.port}`;
    const developmentReact = process.env.SASU_DESKTOP_REACT_MODE === "development";
    execFileSync(developmentReact ? process.execPath : "cmd.exe", developmentReact ? ["tests/e2e/build-development-react.mjs"] : ["/d", "/s", "/c", "npm run build"], {
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
      rmSync(tlsDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  async function removeUserData(userData: string): Promise<void> {
    const absolute = resolve(userData);
    if (!absolute.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
    // Windows may retain Chromium handles briefly after Electron exits.
    await rm(absolute, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
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
      // Electron can expose a loaded page while its native panel is hidden.
      // Focus only this fixture's window before dispatching user input.
      await app.evaluate(({ BrowserWindow }) => {
        const ownedPanel = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("#panel"));
        if (!ownedPanel) throw new Error("fixture_panel_missing");
        ownedPanel.show();
        ownedPanel.focus();
      });
      await expect(panel.getByRole("heading", { name: "사수 시작하기" })).toBeVisible({ timeout: 30_000 });
      // Rendering may precede main's authorized sender assignment.
      await expect.poll(async () => panel.evaluate(async () => window.sasu.app.info().then(() => true).catch(() => false))).toBe(true);
      ownedApps.set(panel, app);
      return { app, panel, pet, userData };
    } catch (cause) {
      await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      await removeUserData(userData);
      throw cause;
    }
  }

  async function prepareOwnedPanel(panel: Page, stage: string) {
    // Supported per-profile pinning keeps OS focus changes from hiding this
    // ASK/WORK fixture. Product blur handling and window tests remain intact.
    await panel.evaluate(() => window.sasu.settings.set({ panelPinned: true }));
    await showOwnedPanel(panel, stage);
  }
  async function showOwnedPanel(panel: Page, stage: string) {
    const app = ownedApps.get(panel);
    if (!app) throw new Error("fixture_app_missing");
    const state = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes("#panel"));
      if (!window) throw new Error("fixture_panel_missing");
      window.show(); window.focus();
      return { visible: window.isVisible(), focused: window.isFocused(), minimized: window.isMinimized() };
    });
    console.log("followup_owned_panel", stage, state);
  }

  async function login(panel: Awaited<ReturnType<typeof launch>>["panel"]) {
    if (process.env.SASU_DESKTOP_REACT_MODE === "development") {
      await panel.addInitScript(() => {
        Reflect.set(window, "strictReactBundleType", null);
        Reflect.set(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
          supportsFiber: true,
          inject: (renderer: { bundleType: number }) => { Reflect.set(window, "strictReactBundleType", renderer.bundleType); return 1; },
          onCommitFiberRoot: (_id: number, root: unknown) => { Reflect.set(window, "strictReactRoot", root); },
          onCommitFiberUnmount: () => undefined,
          checkDCE: () => undefined,
        });
      });
    }
    await panel.evaluate(async (id) => {
      await window.sasu.auth.verifyCode("synthetic@example.test", "123456");
      await window.sasu.link.create({ dept_id: id });
    }, deptId);
    await panel.reload();
    // Match launch's bounded readiness wait; keep behavior assertions at their
    // existing timeouts even when a loaded Windows host delays app startup.
    await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible({ timeout: 30_000 });
    await prepareOwnedPanel(panel, "login-before-input");
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

  function seedDecisionCard() {
    decisionCards = [{ id: cardId, title: "합성 승인 카드", deadline: null, status: "open" }];
    cardStatus = "open";
  }
  function seedSalesSources() {
    sourceCandidates = sourceIds.map((item_id, index) => ({ item_id, title: `합성 원문 ${index + 1}`, kind: "document", quote: "합성 인용은 선택창에서 답으로 보여주지 않습니다.", is_principles: index === 3 }));
  }
  async function selectSalesSources(panel: Awaited<ReturnType<typeof launch>>["panel"], first = sourceIds[0]) {
    for (const [label, id] of [["고객 요청", first], ["기존 견적", sourceIds[1]], ["변경 견적", sourceIds[2]], ["원칙", sourceIds[3]]]) {
      await panel.getByRole("combobox", { name: label, exact: true }).selectOption(id);
    }
  }

  test("sales start 자료 조회는 지연·empty·오류·수동 재조회와 현재 distinct 원칙을 구분한다", async () => {
    contextRole = "lead"; sourceMode = "delayed";
    const { app, panel, userData } = await launch();
    try {
      await login(panel); await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
      if (process.env.SASU_DESKTOP_REACT_MODE === "development") {
        const replay = await panel.evaluate(() => {
          type Hook = { memoizedState: unknown; next: Hook | null };
          type Fiber = { type?: { name?: string }; mode: number; memoizedState: Hook | null; child: Fiber | null; sibling: Fiber | null };
          const root = Reflect.get(window, "strictReactRoot") as { current: Fiber };
          const find = (fiber: Fiber | null): Fiber | null => !fiber ? null : fiber.type?.name === "WorkSalesReview" ? fiber : find(fiber.child) ?? find(fiber.sibling);
          const sales = find(root.current);
          let cleanupGeneration: number | null = null;
          for (let hook = sales?.memoizedState; hook; hook = hook.next) {
            const value = hook.memoizedState as { current?: unknown } | null;
            if (value && typeof value.current === "number") cleanupGeneration = value.current;
          }
          return { bundleType: Reflect.get(window, "strictReactBundleType"), strictEffects: !!sales && (sales.mode & 16) !== 0, cleanupGeneration };
        });
        // DevTools observes the actual development renderer and cleanup of its mounted StrictMode subtree.
        expect(replay).toEqual({ bundleType: 1, strictEffects: true, cleanupGeneration: 1 });
        console.log("strictmode_actual_replay", replay);
      }
      await expect(panel.getByText("자료를 불러오는 중입니다.")).toBeVisible();
      await expect(panel.getByText("선택할 원문이 없습니다.")).toHaveCount(0);
      await panel.getByRole("button", { name: "자료 다시 불러오기" }).evaluate((node) => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
      await expect.poll(() => !!releaseSources).toBe(true); expect(sourceRequests).toBe(1);
      sourceMode = "error"; releaseSources!();
      await expect(panel.getByRole("alert")).toContainText("합성 자료 목록을 불러오지 못했습니다.");
      await expect(panel.getByRole("combobox", { name: "고객 요청", exact: true })).toHaveCount(0);
      sourceMode = "normal"; await panel.getByRole("button", { name: "자료 다시 불러오기" }).click();
      await expect(panel.getByText("선택할 원문이 없습니다.")).toBeVisible();
      seedSalesSources(); await panel.getByRole("button", { name: "자료 다시 불러오기" }).click();
      await selectSalesSources(panel);
      await expect(panel.getByRole("combobox", { name: "원칙", exact: true }).locator("option")).toHaveCount(2);
      const salesSection = panel.locator('section[aria-labelledby="sales-review-title"]');
      await salesSection.scrollIntoViewIfNeeded();
      expect(await panel.evaluate(() => window.innerWidth)).toBe(380);
      expect(await panel.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const screenshots = resolve(process.cwd(), "../docs/verification/47-desktop-sales-flow/screenshots");
      mkdirSync(screenshots, { recursive: true });
      await prepareOwnedPanel(panel, "sales-before-screenshot");
      await panel.screenshot({ path: resolve(screenshots, "sales-form.png") });
      await salesSection.screenshot({ path: resolve(screenshots, "sales-form-section.png") });
      await expect(panel.getByText("합성 인용은 선택창에서 답으로 보여주지 않습니다.")).toHaveCount(0);
      await panel.getByRole("combobox", { name: "고객 요청", exact: true }).selectOption(sourceIds[1]);
      await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
      await expect(panel.getByText("서로 다른 현재 원문 4건을 골라 주세요.")).toBeVisible(); expect(startBodies).toEqual([]);
      await selectSalesSources(panel);
      await panel.getByRole("combobox", { name: "원칙", exact: true }).evaluate((node, value) => {
        const select = node as HTMLSelectElement;
        select.add(new Option("합성 비원칙 후보", value)); select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }, sourceIds[4]);
      await expect(panel.getByRole("button", { name: "검토 시작하기", exact: true })).toBeDisabled();
      await panel.getByRole("button", { name: "검토 시작하기", exact: true }).evaluate((node) => { (node as HTMLButtonElement).click(); });
      expect(startBodies).toEqual([]);
      await selectSalesSources(panel); sourceCandidates = sourceCandidates.filter((row) => row.item_id !== sourceIds[0]);
      await panel.getByRole("button", { name: "자료 다시 불러오기" }).click();
      await expect(panel.getByRole("button", { name: "검토 시작하기", exact: true })).toBeDisabled();
      expect(startBodies).toEqual([]);
      for (const [code, text] of [["lead_only", "팀장만 사용할 수 있습니다."], ["consent_required", "동의한 팀장만 사용할 수 있습니다."], ["demo", "로그인 없이 보는 부서에서는 사용할 수 없습니다."], ["forbidden", "합성 자료 목록을 불러오지 못했습니다."], ["network", "서버에 연결하지 못했습니다."]]) {
        sourceMode = code; await panel.getByRole("button", { name: "자료 다시 불러오기" }).click();
        await expect(panel.getByRole("alert")).toContainText(text);
      }
    } finally { releaseSources?.(); await app.close(); await removeUserData(userData); }
  });

  test("sales start 연타 잠금과 선택별 동일 ID 수동 재시도·새 선택·접수 뒤 중복 금지", async () => {
    contextRole = "lead"; seedSalesSources(); startMode = "delayedError";
    const { app, panel, userData } = await launch();
    try {
      await login(panel); await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
      await selectSalesSources(panel);
      await panel.getByRole("button", { name: "검토 시작하기", exact: true }).evaluate((node) => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
      await expect.poll(() => !!releaseStart).toBe(true); expect(startBodies.length).toBe(1);
      await expect(panel.getByText("검토를 시작하는 중입니다.")).toBeVisible();
      await expect(panel.getByRole("combobox", { name: "고객 요청", exact: true })).toBeDisabled();
      await expect(panel.getByRole("button", { name: "자료 다시 불러오기" })).toBeDisabled();
      releaseStart!(); await expect(panel.getByText("합성 검토 시작을 처리하지 못했습니다.")).toBeVisible();
      await expect(panel.getByRole("combobox", { name: "고객 요청", exact: true })).toHaveValue(sourceIds[0]);
      await panel.waitForTimeout(250); expect(startBodies.length).toBe(1);
      for (const code of ["error", "lead_only", "consent_required", "demo", "forbidden", "network"]) {
        await panel.getByRole("combobox", { name: "고객 요청", exact: true }).selectOption(sourceIds[0]);
        startMode = code; await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
        await expect.poll(() => startBodies.length).toBeGreaterThan(1);
        await expect(panel.getByRole("button", { name: "검토 시작하기", exact: true })).toBeEnabled();
        expect(startBodies.at(-1)?.request_id).toBe(startBodies[0].request_id);
      }
      startMode = "normal"; await selectSalesSources(panel, sourceIds[4]);
      await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
      await expect(panel.getByText("검토를 준비하고 있습니다.")).toBeVisible();
      expect(startBodies.at(-1)?.request_id).not.toBe(startBodies[0].request_id);
      expect(Object.keys(startBodies.at(-1)!).sort()).toEqual(["new_quote_item_id", "old_quote_item_id", "policy_item_id", "request_id", "request_item_id"]);
      const requests = startBodies.length;
      await panel.getByRole("button", { name: "검토 시작하기", exact: true }).evaluate((node) => { (node as HTMLButtonElement).click(); });
      await expect(panel.getByRole("combobox", { name: "고객 요청", exact: true })).toBeDisabled();
      expect(startBodies.length).toBe(requests);
    } finally { releaseStart?.(); await app.close(); await removeUserData(userData); }
  });

  test("sales start source_unavailable은 후보를 숨기고 수동 재검사 뒤 같은 선택을 보존한다", async () => {
    contextRole = "lead"; seedSalesSources(); startMode = "source_unavailable";
    const { app, panel, userData } = await launch();
    try {
      await login(panel); await panel.getByRole("button", { name: "일 맡기기", exact: true }).click(); await selectSalesSources(panel);
      await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
      await expect(panel.getByRole("combobox", { name: "고객 요청", exact: true })).toHaveCount(0);
      await expect(panel.getByRole("alert")).toContainText("합성 검토 시작을 처리하지 못했습니다.");
      startMode = "normal"; await panel.getByRole("button", { name: "자료 다시 불러오기" }).click();
      await expect(panel.getByRole("combobox", { name: "고객 요청", exact: true })).toHaveValue(sourceIds[0]);
      await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
      await expect(panel.getByText("검토를 준비하고 있습니다.")).toBeVisible();
      expect(startBodies[1].request_id).toBe(startBodies[0].request_id);
    } finally { await app.close(); await removeUserData(userData); }
  });

  for (const exit of ["other", "same", "logout"] as const) {
    test(`sales start 자료·시작 늦은 응답은 ${exit} 이탈 뒤 안내·task를 바꾸지 않는다`, async () => {
      contextRole = "lead"; seedSalesSources(); sourceMode = "delayedLead";
      const { app, panel, userData } = await launch();
      const leave = async () => {
        if (exit === "logout") await panel.evaluate(() => window.sasu.auth.signOut());
        else await panel.getByRole("button", { name: exit === "same" ? "일 맡기기" : "질문", exact: true }).click();
      };
      try {
        await login(panel); await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
        await expect.poll(() => !!releaseSources).toBe(true);
        const oldReleaseSources = releaseSources!;
        sourceMode = "normal"; await leave(); oldReleaseSources();
        await panel.waitForTimeout(150);
        await expect(panel.locator(".notice")).toHaveCount(0);
        sourceMode = "normal";
        if (exit === "logout") await login(panel);
        await panel.getByRole("button", { name: "일 맡기기", exact: true }).click(); await selectSalesSources(panel);
        startMode = "delayedError";
        await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
        await expect.poll(() => !!releaseStart).toBe(true);
        await leave(); releaseStart!(); await panel.waitForTimeout(150);
        await expect(panel.locator(".notice")).toHaveCount(0);
        await expect(panel.getByText("검토를 준비하고 있습니다.")).toHaveCount(0);
        expect(salesRequests).toBe(0);
        if (exit === "logout") {
          await expect(panel.getByRole("heading", { name: "사수 시작하기" })).toBeVisible();
          await login(panel);
        }
        {
          await panel.getByRole("button", { name: "일 맡기기", exact: true }).click(); await selectSalesSources(panel);
          startMode = "delayed"; releaseStart = null;
          await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
          await expect.poll(() => !!releaseStart).toBe(true); await leave(); releaseStart!(); await panel.waitForTimeout(150);
          await expect(panel.getByText("검토를 준비하고 있습니다.")).toHaveCount(0); expect(salesRequests).toBe(0);
        }
      } finally { releaseSources?.(); releaseStart?.(); await app.close(); await removeUserData(userData); }
    });
  }
  async function startSalesTask(panel: Awaited<ReturnType<typeof launch>>["panel"]) {
    await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
    await selectSalesSources(panel);
    await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
    await expect(panel.getByText("검토를 준비하고 있습니다.")).toBeVisible();
  }
  async function salesClock(panel: Awaited<ReturnType<typeof launch>>["panel"]) {
    await login(panel);
    await panel.clock.install();
    await panel.reload();
    await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible();
    await panel.clock.pauseAt(new Date(Date.now() + 1_000));
  }
  async function readySalesTask(panel: Awaited<ReturnType<typeof launch>>["panel"]) {
    salesMode = "normal"; salesState = "ready";
    await startSalesTask(panel); await panel.clock.runFor(5_000);
    await expect(panel.getByText("검토가 끝났습니다.")).toBeVisible();
  }
  test("sales status 5초 단일 조회와 한국어 5상태·terminal 새 검토 ID", async () => {
    contextRole = "lead"; seedSalesSources(); salesMode = "delayed"; salesState = "processing";
    const { app, panel, userData } = await launch();
    try {
      await salesClock(panel); await startSalesTask(panel);
      await expect(panel.getByRole("button", { name: "새 검토", exact: true })).toHaveCount(0);
      await panel.getByLabel("검토할 파일", { exact: true }).setInputFiles({ name: "synthetic.exe", mimeType: "application/octet-stream", buffer: Buffer.from("synthetic") });
      await panel.getByRole("checkbox", { name: "참여자 동의 확인", exact: true }).check();
      await panel.getByRole("button", { name: "자료 올리기", exact: true }).click();
      await expect(panel.locator(".notice")).toContainText("파일만 올릴 수 있습니다.");
      await panel.clock.runFor(4_999); expect(salesRequests).toBe(0);
      await panel.clock.runFor(1); await expect.poll(() => !!releaseSales).toBe(true);
      await expect(panel.locator(".notice")).toContainText("파일만 올릴 수 있습니다.");
      await panel.clock.runFor(10_000); expect(salesRequests).toBe(1);
      releaseSales!(); salesMode = "normal";
      await expect(panel.getByText("원문을 검토하고 있습니다.")).toBeVisible();
      await expect(panel.locator(".notice")).toContainText("파일만 올릴 수 있습니다.");
      await expect(panel.getByRole("button", { name: "새 검토", exact: true })).toHaveCount(0);
      for (const [state, text] of [["ready", "검토가 끝났습니다."], ["refused", "검토 근거를 확인하지 못했습니다."], ["failed", "검토를 끝내지 못했습니다."]]) {
        salesState = state; await panel.clock.runFor(5_000);
        await expect(panel.getByText(text, { exact: true })).toBeVisible();
        const terminalRequests = salesRequests; await panel.clock.runFor(10_000); expect(salesRequests).toBe(terminalRequests);
        const oldAttempt = startBodies.at(-1)!.request_id;
        await panel.getByRole("button", { name: "새 검토", exact: true }).click();
        await expect(panel.getByText(text, { exact: true })).toHaveCount(0);
        await expect(panel.getByRole("combobox", { name: "고객 요청", exact: true })).toHaveValue(sourceIds[0]);
        await expect(panel.getByRole("button", { name: "검토 시작하기", exact: true })).toBeEnabled();
        await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
        await expect(panel.getByText("검토를 준비하고 있습니다.")).toBeVisible();
        expect(startBodies.at(-1)!.request_id).not.toBe(oldAttempt);
      }
      expect(new Set(startBodies.map((body) => body.request_id)).size).toBe(4);
    } finally { releaseSales?.(); await app.close(); await removeUserData(userData); }
  });
  test("sales status 오류는 폴링을 멈추고 수동 재확인·재개·not_found 회복을 제공한다", async () => {
    contextRole = "lead"; seedSalesSources(); salesMode = "error";
    const { app, panel, userData } = await launch();
    try {
      await salesClock(panel); await startSalesTask(panel); await panel.clock.runFor(5_000);
      await expect(panel.getByRole("alert")).toContainText("합성 검토 상태를 확인하지 못했습니다.");
      await expect(panel.getByText("검토를 준비하고 있습니다.")).toHaveCount(0);
      const stoppedRequests = salesRequests; await panel.clock.runFor(15_000); expect(salesRequests).toBe(stoppedRequests);
      for (const mode of ["not_found", "forbidden", "network"]) {
        salesMode = mode; await panel.getByRole("button", { name: "상태 다시 확인", exact: true }).click();
        await expect(panel.getByRole("alert")).toContainText(mode === "forbidden" ? "팀장만 사용할 수 있습니다." : mode === "network" ? "서버에 연결하지 못했습니다." : "합성 검토 상태를 확인하지 못했습니다.");
        await expect(panel.getByRole("heading", { name: "영업 원문 검토", exact: true })).toBeVisible();
        await expect(panel.getByRole("button", { name: "웹에서 결과 보기", exact: true })).toHaveCount(0);
      }
      salesMode = "delayed"; salesState = "queued"; releaseSales = null;
      await panel.getByRole("button", { name: "상태 다시 확인", exact: true }).evaluate((node) => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
      await expect.poll(() => !!releaseSales).toBe(true);
      const retryRequests = salesRequests; await panel.clock.runFor(10_000); expect(salesRequests).toBe(retryRequests);
      releaseSales!(); salesMode = "normal"; await expect(panel.getByText("검토를 준비하고 있습니다.")).toBeVisible();
      salesState = "processing"; await panel.clock.runFor(5_000); await expect(panel.getByText("원문을 검토하고 있습니다.")).toBeVisible();
      salesMode = "not_found"; await panel.clock.runFor(5_000); await expect(panel.getByRole("alert")).toBeVisible();
      salesMode = "normal"; salesState = "ready"; await panel.getByRole("button", { name: "상태 다시 확인", exact: true }).click();
      await expect(panel.getByText("검토가 끝났습니다.")).toBeVisible(); expect(startBodies.length).toBe(1);
    } finally { releaseSales?.(); await app.close(); await removeUserData(userData); }
  });
  test("sales status 현재 ready만 열고 조회·웹 실패는 미읽음이며 연타는 1회다", async () => {
    contextRole = "lead"; seedSalesSources();
    const { app, panel, userData } = await launch();
    try {
      await salesClock(panel); await trackWeb(app); await readySalesTask(panel);
      const salesSection = panel.locator('section[aria-labelledby="sales-review-title"]');
      await salesSection.scrollIntoViewIfNeeded();
      expect(await panel.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const screenshots = resolve(process.cwd(), "../docs/verification/47-desktop-sales-flow/screenshots");
      mkdirSync(screenshots, { recursive: true });
      await panel.screenshot({ path: resolve(screenshots, "sales-ready.png") });
      await salesSection.screenshot({ path: resolve(screenshots, "sales-ready-section.png") });
      salesState = "processing";
      await panel.getByRole("button", { name: "웹에서 결과 보기", exact: true }).click();
      await expect(panel.getByText("원문을 검토하고 있습니다.")).toBeVisible();
      expect(await webEvents(app)).toEqual([]); expect((await panel.evaluate(() => window.sasu.settings.get())).seen).not.toContain(salesId);
      salesState = "ready"; await panel.clock.runFor(5_000); await expect(panel.getByText("검토가 끝났습니다.")).toBeVisible();
      salesMode = "not_found"; await panel.getByRole("button", { name: "웹에서 결과 보기", exact: true }).click();
      await expect(panel.getByRole("alert")).toBeVisible(); await expect(panel.getByText("검토가 끝났습니다.")).toHaveCount(0);
      await expect(panel.getByRole("button", { name: "웹에서 결과 보기", exact: true })).toHaveCount(0);
      expect(await webEvents(app)).toEqual([]); expect((await panel.evaluate(() => window.sasu.settings.get())).seen).not.toContain(salesId);
      salesMode = "normal"; await panel.getByRole("button", { name: "상태 다시 확인", exact: true }).click();
      await expect(panel.getByText("검토가 끝났습니다.")).toBeVisible(); await trackWeb(app, true);
      await panel.getByRole("button", { name: "웹에서 결과 보기", exact: true }).click();
      await expect(panel.getByRole("alert")).toContainText("합성 웹 열기 실패");
      expect((await panel.evaluate(() => window.sasu.settings.get())).seen).not.toContain(salesId);
      await panel.getByRole("button", { name: "상태 다시 확인", exact: true }).click();
      await expect(panel.getByText("검토가 끝났습니다.")).toBeVisible(); await trackWeb(app);
      await app.evaluate(({ shell }) => {
        Reflect.set(globalThis, "salesOpenPending", false);
        shell.openExternal = async (url: string) => {
          Reflect.set(globalThis, "salesOpenPending", true);
          await new Promise<void>((resolve) => Reflect.set(globalThis, "salesOpenRelease", resolve));
          (Reflect.get(globalThis, "recentWorkOpened") as string[]).push(url);
        };
      });
      salesMode = "delayed"; releaseSales = null; const beforeOpen = salesRequests;
      await panel.getByRole("button", { name: "웹에서 결과 보기", exact: true }).evaluate((node) => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
      await expect.poll(() => !!releaseSales).toBe(true); expect(salesRequests).toBe(beforeOpen + 1);
      await expect(panel.getByRole("button", { name: "새 검토", exact: true })).toBeDisabled();
      await panel.clock.runFor(10_000); expect(salesRequests).toBe(beforeOpen + 1);
      expect(await webEvents(app)).toEqual([]); expect((await panel.evaluate(() => window.sasu.settings.get())).seen).not.toContain(salesId);
      releaseSales!(); await expect.poll(() => app.evaluate(() => Reflect.get(globalThis, "salesOpenPending"))).toBe(true);
      expect((await panel.evaluate(() => window.sasu.settings.get())).seen).not.toContain(salesId);
      await panel.getByRole("button", { name: "새 검토", exact: true }).evaluate((node) => { (node as HTMLButtonElement).click(); });
      await expect(panel.getByRole("button", { name: "검토 시작하기", exact: true })).toBeDisabled();
      await app.evaluate(() => (Reflect.get(globalThis, "salesOpenRelease") as () => void)());
      await expect.poll(() => webEvents(app)).toEqual([`${fixtureOrigin}/d/${deptId}/sales-review?task_id=${salesId}`]);
      await expect.poll(async () => (await panel.evaluate(() => window.sasu.settings.get())).seen).toContain(salesId);
    } finally { releaseSales?.(); await app.close(); await removeUserData(userData); }
  });
  for (const exit of ["other", "same", "logout"] as const) {
    test(`sales status 조회·웹 열기·읽음 늦은 응답은 ${exit} 이탈 뒤 반영하지 않는다`, async () => {
      contextRole = "lead"; seedSalesSources();
      const { app, panel, userData } = await launch();
      const leave = async () => {
        if (exit === "logout") await panel.evaluate(() => window.sasu.auth.signOut());
        else await panel.getByRole("button", { name: exit === "same" ? "일 맡기기" : "질문", exact: true }).click();
      };
      const returnToWork = async () => { if (exit === "logout") await login(panel); };
      try {
        await salesClock(panel); await trackWeb(app);
        for (const [open, mode] of [[false, "delayed"], [false, "delayedError"], [true, "delayed"], [true, "delayedError"]] as const) {
          await returnToWork();
          if (open) await readySalesTask(panel); else await startSalesTask(panel);
          salesMode = mode; releaseSales = null;
          if (open) await panel.getByRole("button", { name: "웹에서 결과 보기", exact: true }).click();
          else await panel.clock.runFor(5_000);
          await expect.poll(() => !!releaseSales).toBe(true); await leave(); releaseSales!(); salesMode = "normal";
          await panel.waitForTimeout(150);
          await expect(panel.locator(".notice")).toHaveCount(0);
          await expect(panel.getByText("검토가 끝났습니다.")).toHaveCount(0);
          expect(await webEvents(app)).toEqual([]);
          expect((await panel.evaluate(() => window.sasu.settings.get())).seen).not.toContain(salesId);
        }
        await returnToWork(); await readySalesTask(panel);
        await app.evaluate(({ shell }) => {
          Reflect.set(globalThis, "salesOpenPending", false);
          shell.openExternal = async () => { Reflect.set(globalThis, "salesOpenPending", true); await new Promise<void>((resolve) => Reflect.set(globalThis, "salesOpenRelease", resolve)); };
        });
        await panel.getByRole("button", { name: "웹에서 결과 보기", exact: true }).click();
        await expect.poll(() => app.evaluate(() => Reflect.get(globalThis, "salesOpenPending"))).toBe(true);
        await expect(panel.getByRole("button", { name: "새 검토", exact: true })).toBeDisabled();
        await leave(); await app.evaluate(() => (Reflect.get(globalThis, "salesOpenRelease") as () => void)());
        await panel.waitForTimeout(150); await expect(panel.locator(".notice")).toHaveCount(0);
        expect((await panel.evaluate(() => window.sasu.settings.get())).seen).not.toContain(salesId);
        await returnToWork(); await readySalesTask(panel); await trackWeb(app);
        await app.evaluate(({ ipcMain }) => {
          Reflect.set(globalThis, "salesSeenPending", false);
          ipcMain.removeHandler("settings:markSeen");
          ipcMain.handle("settings:markSeen", async () => {
            Reflect.set(globalThis, "salesSeenPending", true);
            await new Promise<void>((resolve) => Reflect.set(globalThis, "salesSeenRelease", resolve));
            throw new Error("합성 늦은 영업 읽음 오류");
          });
        });
        await panel.getByRole("button", { name: "웹에서 결과 보기", exact: true }).click();
        await expect.poll(() => app.evaluate(() => Reflect.get(globalThis, "salesSeenPending"))).toBe(true);
        expect(await webEvents(app)).toHaveLength(1);
        await leave(); await app.evaluate(() => (Reflect.get(globalThis, "salesSeenRelease") as () => void)());
        await panel.waitForTimeout(150); await expect(panel.locator(".notice")).toHaveCount(0);
        await expect(panel.getByText("합성 늦은 영업 읽음 오류")).toHaveCount(0);
      } finally { releaseSales?.(); await app.close(); await removeUserData(userData); }
    });
  }
  async function openDecisionCard(panel: Awaited<ReturnType<typeof launch>>["panel"]) {
    await panel.getByRole("button", { name: "결정함", exact: true }).click();
    await panel.getByRole("button", { name: /합성 승인 카드/ }).click();
    await expect(panel.getByRole("heading", { name: "합성 승인 카드" })).toBeVisible();
  }

  test("결정함은 목록 로딩·오류를 빈 상태와 구분하고 상태와 재시도를 표시한다", async () => {
    contextRole = "lead"; inboxMode = "delayed";
    const { app, panel, userData } = await launch();
    try {
      await login(panel);
      await panel.getByRole("button", { name: "결정함", exact: true }).click();
      await expect(panel.getByText("카드를 불러오는 중입니다.")).toBeVisible();
      await expect(panel.getByText("지금 결정할 카드가 없습니다.")).toHaveCount(0);
      await expect.poll(() => !!releaseInbox).toBe(true);
      inboxMode = "error"; releaseInbox!();
      await expect(panel.getByRole("alert")).toContainText("최근 작업을 불러오지 못했습니다.");
      await expect(panel.getByText("지금 결정할 카드가 없습니다.")).toHaveCount(0);
      inboxMode = "normal";
      await panel.getByRole("button", { name: "카드 새로고침" }).click();
      await expect(panel.getByText("지금 결정할 카드가 없습니다.")).toBeVisible();
      seedDecisionCard(); decisionCards.push({ id: randomUUID(), title: "합성 검토 카드", deadline: "2026-10-05T00:00:00Z", status: "needs_review" });
      await panel.getByRole("button", { name: "카드 새로고침" }).click();
      await expect(panel.getByText("결정 대기", { exact: true })).toBeVisible();
      await expect(panel.getByText("검토 필요", { exact: true })).toBeVisible();
      await expect(panel.getByText("마감 미정")).toBeVisible();
      await expect(panel.getByText("2026-10-05T00:00:00Z")).toBeVisible();
      const shots = resolve(process.cwd(), "../docs/verification/46-desktop-decision-flow/screenshots");
      mkdirSync(shots, { recursive: true }); await panel.screenshot({ path: resolve(shots, "decision-list.png") });
    } finally {
      releaseInbox?.(); await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      await removeUserData(userData);
    }
  });

  test("결정함 상세 연타는 한 번이며 현재 근거 없는 카드와 권한 실패는 읽지 않는다", async () => {
    seedDecisionCard(); cardMode = "delayed";
    const { app, panel, userData } = await launch();
    try {
      await login(panel); await panel.getByRole("button", { name: "결정함", exact: true }).click();
      await panel.getByRole("button", { name: /합성 승인 카드/ }).evaluate((node) => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
      await expect.poll(() => !!releaseCard).toBe(true);
      expect(cardRequests).toBe(1);
      await expect(panel.getByText("카드 내용을 불러오는 중입니다.")).toBeVisible();
      cardMode = "noCitations"; releaseCard!();
      await expect(panel.getByText("근거를 확인하지 못해 내용을 보여 주지 않습니다.")).toBeVisible();
      await expect(panel.getByRole("heading", { name: "합성 승인 카드" })).toHaveCount(0);
      await expect(panel.getByRole("button", { name: "결정하기", exact: true })).toHaveCount(0);
      expect(await panel.evaluate(async () => (await window.sasu.settings.get()).seen)).not.toContain(cardId);
      await panel.getByRole("button", { name: "목록으로 돌아가기" }).click();
      cardMode = "forbidden";
      await panel.getByRole("button", { name: /합성 승인 카드/ }).click();
      await expect(panel.getByText("이 카드를 확인할 수 없습니다.")).toBeVisible();
      cardMode = "normal";
      await panel.getByRole("button", { name: /합성 승인 카드/ }).click();
      await expect.poll(() => panel.evaluate(async () => (await window.sasu.settings.get()).seen)).toContain(cardId);
      await panel.getByRole("button", { name: "목록으로 돌아가기" }).click();
      cardStatus = "decided";
      await panel.getByRole("button", { name: /합성 승인 카드/ }).click();
      await expect(panel.getByText("이미 처리한 카드입니다.")).toBeVisible();
      await expect(panel.getByRole("button", { name: "결정하기", exact: true })).toHaveCount(0);
      expect(decisionBodies).toEqual([]);
    } finally {
      releaseCard?.(); await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      await removeUserData(userData);
    }
  });

  test("결정함 결정·보류·반려·이미 결정된 응답은 목록 복귀와 현재 갱신으로 끝난다", async () => {
    seedDecisionCard();
    const { app, panel, userData } = await launch();
    try {
      await login(panel);
      for (const [status, label] of [["decided", "결정하기"], ["deferred", "미루기"], ["rejected", "돌려보내기"], ["decided", "결정하기"]]) {
        seedDecisionCard(); decideMode = decisionBodies.length === 3 ? "duplicate" : "normal";
        await panel.getByRole("button", { name: "결정함", exact: true }).click();
        await panel.getByRole("button", { name: "카드 새로고침" }).click();
        await openDecisionCard(panel);
        await panel.getByRole("textbox", { name: "결과", exact: true }).fill("합성 승인 결과");
        await panel.getByRole("textbox", { name: "이유", exact: true }).fill("합성 원칙 확인");
        const refreshed = inboxRequests;
        await panel.getByRole("button", { name: label, exact: true }).click();
        await expect(panel.getByRole("heading", { name: "결정할 카드" })).toBeVisible();
        await expect(panel.getByText("지금 결정할 카드가 없습니다.")).toBeVisible();
        expect(inboxRequests).toBeGreaterThan(refreshed);
        expect(decisionBodies.at(-1)).toEqual({ status, outcome: "합성 승인 결과", rationale: "합성 원칙 확인" });
      }
      await expect(panel.getByText("이미 합성 팀장이 결정했습니다.")).toBeVisible();
      expect(decisionBodies.length).toBe(4);
    } finally {
      await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      await removeUserData(userData);
    }
  });

  test("결정함 처리 실패는 초안을 유지하고 연타와 자동 재전송을 막는다", async () => {
    seedDecisionCard(); decideMode = "delayedError";
    const { app, panel, userData } = await launch();
    try {
      await login(panel); await openDecisionCard(panel);
      await panel.getByRole("textbox", { name: "결과", exact: true }).fill("보존할 합성 결과");
      await panel.getByRole("textbox", { name: "이유", exact: true }).fill("보존할 합성 이유");
      await panel.locator("form.decision").evaluate((node) => { node.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); node.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
      await expect.poll(() => !!releaseDecision).toBe(true);
      expect(decisionBodies.length).toBe(1);
      await expect(panel.getByRole("button", { name: "결정하기", exact: true })).toBeDisabled();
      releaseDecision!();
      await expect(panel.getByText(/합성 결정을 처리하지 못했습니다/)).toBeVisible();
      for (const mode of ["forbidden", "conflict", "offline"]) {
        decideMode = mode;
        await panel.getByRole("button", { name: "결정하기", exact: true }).click();
        await expect(panel.getByRole("button", { name: "결정하기", exact: true })).toBeEnabled();
        await expect(panel.getByRole("textbox", { name: "결과", exact: true })).toHaveValue("보존할 합성 결과");
        await expect(panel.getByRole("textbox", { name: "이유", exact: true })).toHaveValue("보존할 합성 이유");
      }
      expect(decisionBodies.length).toBe(4);
      decideMode = "normal"; inboxMode = "error";
      await panel.getByRole("button", { name: "결정하기", exact: true }).click();
      await expect(panel.getByRole("heading", { name: "결정할 카드" })).toBeVisible();
      await expect(panel.getByRole("alert")).toBeVisible();
      expect(decisionBodies.length).toBe(5);
    } finally {
      releaseDecision?.(); await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      await removeUserData(userData);
    }
  });

  test("결정함 늦은 상세와 처리 응답은 탭 이탈·목록 복귀·로그아웃 뒤 화면을 바꾸지 않는다", async () => {
    seedDecisionCard(); cardMode = "delayed";
    const { app, panel, userData } = await launch();
    try {
      await login(panel);
      await panel.getByRole("button", { name: "결정함", exact: true }).click();
      await panel.getByRole("button", { name: /합성 승인 카드/ }).click();
      await expect.poll(() => !!releaseCard).toBe(true);
      await panel.getByRole("button", { name: "질문", exact: true }).click();
      cardMode = "normal"; releaseCard!();
      await panel.evaluate(async (id) => window.sasu.card.get(id), cardId);
      await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible();
      expect(await panel.evaluate(async () => (await window.sasu.settings.get()).seen)).not.toContain(cardId);
      for (const departure of ["back", "tab", "logout"]) {
        seedDecisionCard(); decideMode = departure === "tab" ? "delayed" : "delayedError"; releaseDecision = null;
        await panel.getByRole("button", { name: "결정함", exact: true }).click();
        await panel.getByRole("button", { name: "카드 새로고침" }).click();
        await openDecisionCard(panel);
        await panel.getByRole("button", { name: "미루기", exact: true }).click();
        await expect.poll(() => !!releaseDecision).toBe(true);
        if (departure === "back") await panel.getByRole("button", { name: "목록으로 돌아가기" }).click();
        else await panel.getByRole("button", { name: "설정", exact: true }).click();
        if (departure === "logout") await panel.getByRole("button", { name: "로그아웃하기" }).click();
        const refreshed = inboxRequests;
        releaseDecision!();
        await panel.evaluate(async (id) => window.sasu.card.get(id).catch(() => null), cardId);
        await expect(panel.getByText(/합성 결정을 처리하지 못했습니다/)).toHaveCount(0);
        expect(inboxRequests).toBe(refreshed);
      }
      await expect(panel.getByRole("heading", { name: "사수 시작하기" })).toBeVisible();
    } finally {
      releaseCard?.(); releaseDecision?.(); await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      await removeUserData(userData);
    }
  });

  test("결정함 늦은 읽음 오류와 로그아웃 뒤 상세 응답은 다음 화면에 남지 않는다", async () => {
    seedDecisionCard();
    const { app, panel, userData } = await launch();
    try {
      await login(panel);
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler("settings:markSeen");
        ipcMain.handle("settings:markSeen", async () => {
          await new Promise<void>((resolve) => Reflect.set(globalThis, "releaseCardSeen", resolve));
          throw new Error("합성 카드 읽음 저장 실패");
        });
      });
      await openDecisionCard(panel);
      await expect.poll(() => app.evaluate(() => !!Reflect.get(globalThis, "releaseCardSeen"))).toBe(true);
      await panel.getByRole("button", { name: "목록으로 돌아가기" }).click();
      await app.evaluate(() => (Reflect.get(globalThis, "releaseCardSeen") as () => void)());
      await panel.evaluate(async () => { await window.sasu.app.info(); await window.sasu.app.info(); });
      await expect(panel.getByText(/합성 카드 읽음 저장 실패/)).toHaveCount(0);
      await app.evaluate(() => Reflect.set(globalThis, "releaseCardSeen", null));
      await openDecisionCard(panel);
      await expect.poll(() => app.evaluate(() => !!Reflect.get(globalThis, "releaseCardSeen"))).toBe(true);
      await panel.getByRole("button", { name: "결정함", exact: true }).click();
      await app.evaluate(() => (Reflect.get(globalThis, "releaseCardSeen") as () => void)());
      await panel.evaluate(async () => { await window.sasu.app.info(); await window.sasu.app.info(); });
      await expect(panel.getByText(/합성 카드 읽음 저장 실패/)).toHaveCount(0);
      cardMode = "delayed";
      await panel.getByRole("button", { name: /합성 승인 카드/ }).click();
      await expect.poll(() => !!releaseCard).toBe(true);
      await panel.getByRole("button", { name: "설정", exact: true }).click();
      await panel.getByRole("button", { name: "로그아웃하기" }).click();
      cardMode = "normal"; releaseCard!();
      await panel.evaluate(async (id) => window.sasu.card.get(id).catch(() => null), cardId);
      await expect(panel.getByRole("heading", { name: "사수 시작하기" })).toBeVisible();
      expect(await panel.evaluate(async () => (await window.sasu.settings.get()).seen)).not.toContain(cardId);
    } finally {
      releaseCard?.(); await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      await removeUserData(userData);
    }
  });

  test("결정함 처리 뒤 갱신은 처리 전 자동 조회의 늦은 스냅샷을 다시 쓰지 않는다", async () => {
    seedDecisionCard();
    const { app, panel, userData } = await launch();
    try {
      await login(panel); await panel.clock.install(); await panel.reload();
      await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible();
      await openDecisionCard(panel); inboxMode = "delayed";
      await panel.clock.runFor(30_000);
      await expect.poll(() => !!releaseInbox).toBe(true);
      const before = inboxRequests;
      await panel.getByRole("button", { name: "미루기", exact: true }).click();
      await expect(panel.getByRole("heading", { name: "결정할 카드" })).toBeVisible();
      await expect(panel.getByText("카드를 불러오는 중입니다.")).toBeVisible();
      inboxMode = "normal"; releaseInbox!();
      await expect(panel.getByText("지금 결정할 카드가 없습니다.")).toBeVisible();
      expect(inboxRequests).toBe(before + 1);
      await expect(panel.getByRole("button", { name: /합성 승인 카드/ })).toHaveCount(0);
      expect(decisionBodies.length).toBe(1);
    } finally {
      releaseInbox?.(); await app.close();
      if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
      await removeUserData(userData);
    }
  });

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
      await removeUserData(userData);
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
      await removeUserData(userData);
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
      await removeUserData(userData);
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
      await removeUserData(userData);
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
      await removeUserData(userData);
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
      await removeUserData(userData);
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
      await removeUserData(userData);
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
      await removeUserData(userData);
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
      await removeUserData(userData);
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
      await removeUserData(userData);
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
      await removeUserData(userData);
    }
  });

  test("질문 한도 429는 이어 묻기 초안·부모를 보존하고 보관·자동 재전송하지 않는다", async () => {
    previousQuestion = "질문 한도 테스트의 합성 부모 질문입니다.";
    const { app, panel, userData } = await launch();
    try {
      await login(panel);
      await panel.getByRole("button", { name: "기록", exact: true }).click();
      await panel.getByRole("button", { name: /질문 한도 테스트의 합성 부모/ }).click();
      await panel.getByRole("button", { name: "이어 묻기", exact: true }).click();
      const draft = "한도를 넘긴 합성 후속 질문을 보존해 주세요.";
      await panel.getByLabel("질문 내용").fill(draft);
      askMode = "limit";
      await panel.getByRole("button", { name: "질문하기", exact: true }).click();
      await expect(panel.getByText("오늘 질문 한도를 모두 사용했습니다.")).toBeVisible();
      await expect(panel.getByLabel("질문 내용")).toHaveValue(draft);
      await expect(panel.getByText("이 질문에 이어 묻습니다.")).toBeVisible();
      expect(askBodies).toEqual([{ question: draft, parent_id: answerId }]);
      expect((await panel.evaluate(async () => window.sasu.inbox.get())).outbox_count).toBe(0);
      expect(askBodies).toHaveLength(1);
      expect(existsSync(resolve(userData, "outbox.bin"))).toBe(false);
      const screenshots = resolve(process.cwd(), "../docs/verification/44-desktop-question-followup/screenshots");
      mkdirSync(screenshots, { recursive: true });
      await panel.screenshot({ path: resolve(screenshots, "followup-429.png") });
      askMode = "accepted";
      await panel.getByRole("button", { name: "질문하기", exact: true }).click();
      await expect.poll(() => askBodies.length).toBe(2);
      expect(askBodies[1]).toEqual({ question: draft, parent_id: answerId });
    } finally {
      await app.close();
      await removeUserData(userData);
    }
  });

  test("페이지 오류 뒤 목록과 cursor를 보존하고 빠른 상세 연타는 한 번만 조회한다", async () => {
    previousQuestion = "페이지 실패에도 남아야 하는 합성 첫 질문";
    historyMode = "pages";
    const { app, panel, userData } = await launch();
    try {
      await login(panel);
      await panel.getByRole("button", { name: "기록", exact: true }).click();
      const first = panel.getByRole("button", { name: /페이지 실패에도 남아야/ });
      await expect(first).toBeVisible();
      historyMode = "page-error";
      await panel.getByRole("button", { name: "더 보기", exact: true }).click();
      await expect(panel.getByText("질문 기록을 불러오지 못했습니다.")).toBeVisible();
      await expect(first).toBeVisible();
      await expect(panel.getByRole("button", { name: "더 보기", exact: true })).toBeEnabled();
      expect(historyRequests).toBe(2);
      const failedCursor = historyUrls[1];
      historyMode = "pages";
      await panel.getByRole("button", { name: "더 보기", exact: true }).click();
      await expect(panel.getByRole("button", { name: /더 오래된 합성 후속 질문/ })).toBeVisible();
      expect(historyRequests).toBe(3);
      expect(historyUrls[2]).toBe(failedCursor);
      await expect(first).toHaveCount(1);
      answerMode = "delayed";
      // Two clicks in the same event-loop turn exercise the synchronous ref
      // lock, before React has rendered disabled=true.
      await first.evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
      await expect.poll(() => !!releaseAnswer).toBe(true);
      await expect(first).toBeDisabled();
      expect(answerRequests).toBe(1);
      releaseAnswer!();
      await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible();
      await expect(panel.getByText("근거가 부족해 답하지 못했습니다.")).toBeVisible();
      expect(answerRequests).toBe(1);
    } finally {
      releaseAnswer?.();
      await app.close();
      await removeUserData(userData);
    }
  });

  for (const delayed of ["목록", "상세"] as const) {
    test(`이전 세션의 늦은 ${delayed} 응답은 로그아웃·새 로그인 뒤 표시되지 않는다`, async () => {
      previousQuestion = "이전 사용자만 보던 지연된 합성 질문";
      if (delayed === "목록") historyMode = "delayed";
      else answerMode = "delayed";
      const { app, panel, userData } = await launch();
      try {
        await login(panel);
        await panel.getByRole("button", { name: "기록", exact: true }).click();
        if (delayed === "목록") await expect.poll(() => !!releaseHistory).toBe(true);
        else {
          await panel.getByRole("button", { name: /이전 사용자만 보던/ }).click();
          await expect.poll(() => !!releaseAnswer).toBe(true);
        }
        await panel.getByRole("button", { name: "설정", exact: true }).click();
        await panel.getByRole("button", { name: "로그아웃하기", exact: true }).click();
        await expect(panel.getByRole("heading", { name: "사수 시작하기" })).toBeVisible();
        previousQuestion = ""; currentUserId = randomUUID(); historyMode = "normal";
        await panel.getByLabel("이메일").fill("synthetic-next@example.test");
        await panel.getByRole("button", { name: "코드 받기", exact: true }).click();
        await panel.getByLabel("6자리 코드").fill("123456");
        await panel.getByRole("button", { name: "로그인하기", exact: true }).click();
        await panel.getByRole("button", { name: "합성 부서", exact: true }).click();
        await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible();
        const completedBeforeRelease = delayed === "목록" ? historyResponses : answerResponses;
        if (delayed === "목록") releaseHistory!();
        else releaseAnswer!();
        await expect.poll(() => delayed === "목록" ? historyResponses : answerResponses).toBe(completedBeforeRelease + 1);
        await panel.getByRole("button", { name: "기록", exact: true }).click();
        await expect(panel.getByText("아직 질문 기록이 없습니다.")).toBeVisible();
        await expect(panel.getByText(/이전 사용자만 보던/)).toHaveCount(0);
        await panel.getByRole("button", { name: "질문", exact: true }).click();
        await expect(panel.getByText("근거가 부족해 답하지 못했습니다.")).toHaveCount(0);
        await expect(panel.getByLabel("질문 내용")).toHaveValue("");
        expect((await panel.evaluate(async () => window.sasu.settings.get())).seen).toEqual([]);
      } finally {
        releaseHistory?.(); releaseAnswer?.();
        await app.close();
        await removeUserData(userData);
      }
    });
  }

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
        await prepareOwnedPanel(panel, "session-before-question");
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
        // Cleanup assertions above and default settings below must stay real;
        // restore native visibility without writing a preference after logout.
        await showOwnedPanel(panel, "session-after-logout-before-screenshot");
        await panel.screenshot({ path: resolve(screenshots, reason === "설정 로그아웃" ? "desktop-session-logout.png" : "desktop-session-401.png") });

        revoked = false; previousQuestion = ""; currentUserId = randomUUID();
        await panel.getByLabel("이메일").fill("synthetic-next@example.test");
        await showOwnedPanel(panel, "session-before-code-request");
        await panel.getByRole("button", { name: "코드 받기" }).click();
        await expect(panel.getByText("로그인 코드를 보냈습니다.")).toBeVisible();
        await panel.getByLabel("6자리 코드").fill("123456");
        await showOwnedPanel(panel, "session-before-ui-login");
        await panel.getByRole("button", { name: "로그인하기" }).click();
        await showOwnedPanel(panel, "session-before-link");
        await panel.getByRole("button", { name: "합성 부서", exact: true }).click();
        await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible();
        await expect(panel.getByText("근거가 부족해 답하지 못했습니다.")).toHaveCount(0);
        await showOwnedPanel(panel, "session-before-history");
        await panel.getByRole("button", { name: "기록", exact: true }).click();
        await expect(panel.getByText("이전 사용자의 합성 질문 기록입니다.")).toHaveCount(0);
        expect(await panel.evaluate(async () => window.sasu.settings.get())).toMatchObject({ seen: [], pet: "green", panelPinned: false });
      } finally {
        await app.close();
        await removeUserData(userData);
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
      await removeUserData(userData);
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
      await removeUserData(userData);
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
      await removeUserData(userData);
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
      await prepareOwnedPanel(panel, "polling-before-input");
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
      await removeUserData(userData);
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
      await removeUserData(userData);
    }
  });
});
