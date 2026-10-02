import { expect, test, _electron as electron } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer, type Server } from "node:http";

// Synthetic IPC responses exercise the real packaged renderer/preload/settings
// without an Auth session, customer data, database, or model call.
test.describe("desktop followup", () => {
  test.describe.configure({ timeout: 90_000 });
  let fixtureServer: Server;
  let fixtureOrigin: string;
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
  test.beforeEach(() => {
    askMode = "accepted"; revoked = false; askRequests = 0; previousQuestion = ""; currentUserId = userId;
  });
  test.beforeAll(async () => {
    const user = { id: userId, aud: "authenticated", role: "authenticated", email: "synthetic@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    const expiresAt = Math.floor(Date.now() / 1_000) + 3_600;
    const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: expiresAt })).toString("base64url")}.${Buffer.from("synthetic-signature").toString("base64url")}`;
    fixtureServer = createServer(async (request, response) => {
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
        } else response.end(JSON.stringify({ departments: [{ id: deptId, name: "합성 부서", role: "member", consented: true }] }));
      } else if (path === "/api/companion/link" && request.method === "DELETE") {
        response.statusCode = 204;
        response.end();
      } else if (path === "/api/companion/link" && request.method === "POST") {
        linkedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        response.statusCode = 201;
        response.end(JSON.stringify({ link_id: linkId, dept: { id: deptId, name: "합성 부서" }, role: "member" }));
      } else if (path === "/api/companion/link") {
        response.end(JSON.stringify({ link_id: linkId, dept: { id: deptId, name: "합성 부서" }, role: "member", display_name: "합성 팀원" }));
      } else if (path === "/api/companion/inbox") {
        if (revoked) {
          response.statusCode = 401;
          response.end(JSON.stringify({ code: "device_revoked", error: "기기 연결이 해제되었습니다." }));
        } else response.end(JSON.stringify({ server_time: new Date().toISOString(), cards: [], answers: [], reviews: [], sales: [] }));
      } else if (path === "/api/companion/ask") {
        askRequests += 1;
        if (askMode === "offline") {
          response.statusCode = 503;
          response.end(JSON.stringify({ code: "temporarily_unavailable", error: "잠시 후 다시 시도해 주세요." }));
        } else if (askMode === "invalid") response.end(JSON.stringify({ unexpected: true }));
        else {
          previousQuestion = JSON.parse(Buffer.concat(chunks).toString("utf8")).question;
          response.statusCode = 202;
          response.end(JSON.stringify({ answer_id: answerId, job_id: linkId, truncated: false }));
        }
      } else if (path === `/api/companion/answers/${answerId}`) {
        response.end(JSON.stringify({ id: answerId, status: "refused", answer: null, refused: true, citations: [] }));
      } else if (path === "/api/companion/questions") {
        response.end(JSON.stringify({ questions: previousQuestion ? [{ id: answerId, question: previousQuestion, status: "refused", created_at: new Date().toISOString(), parent_id: null }] : [], next: null }));
      } else {
        response.statusCode = 404;
        response.end(JSON.stringify({ code: "not_found", error: "합성 경로를 찾지 못했습니다." }));
      }
    });
    await new Promise<void>((resolve) => fixtureServer.listen(0, "127.0.0.1", resolve));
    const address = fixtureServer.address();
    if (!address || typeof address === "string") throw new Error("fixture_address_missing");
    fixtureOrigin = `http://127.0.0.1:${address.port}`;
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
  });

  async function launch() {
    const userData = mkdtempSync(resolve(tmpdir(), "sasu-desktop-followup-"));
    const app = await electron.launch({
      args: [".", `--user-data-dir=${userData}`],
      executablePath: resolve(process.cwd(), "node_modules/electron/dist/electron.exe"),
      env: { ...process.env, SASU_DISABLE_UPDATER: "1" },
    });
    const panel = app.windows().find((page) => page.url().includes("#panel"))!;
    const pet = app.windows().find((page) => page.url().includes("#pet"))!;
    await expect(panel.getByRole("heading", { name: "사수 시작하기" })).toBeVisible();
    // The renderer can paint before createDesktopWindows finishes assigning
    // the authorized sender; wait for main readiness before driving IPC.
    await expect.poll(async () => panel.evaluate(async () => window.sasu.app.info().then(() => true).catch(() => false))).toBe(true);
    return { app, panel, pet, userData };
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
