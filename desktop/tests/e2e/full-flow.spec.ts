import { expect, test, _electron as electron } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.SASU_DESKTOP_E2E === "1";
const root = resolve(process.cwd(), "..");

function localStatus(): Record<string, string> {
  const output = execFileSync("cmd.exe", ["/d", "/s", "/c", "npx --yes supabase status --workdir .vercel/review-qa -o json"], { cwd: root, encoding: "utf8" });
  return JSON.parse(output.slice(output.indexOf("{"))) as Record<string, string>;
}

function sql(query: string): string {
  return execFileSync("docker", ["exec", "-i", "supabase_db_review-qa", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-q"], { input: query, encoding: "utf8" }).trim();
}

function build(local: Record<string, string>): void {
  execFileSync("cmd.exe", ["/d", "/s", "/c", "npm run build"], {
    cwd: resolve(root, "desktop"),
    env: { ...process.env, SASU_APP_URL: "http://127.0.0.1:3011", SUPABASE_URL: local.API_URL, SUPABASE_ANON_KEY: local.ANON_KEY },
    stdio: "inherit",
  });
}

function plaintextFiles(root: string, value: string): string[] {
  const needle = Buffer.from(value, "utf8");
  const found: string[] = [];
  const visit = (path: string): void => {
    for (const entry of readdirSync(path)) {
      const target = resolve(path, entry);
      const stats = statSync(target);
      if (stats.isDirectory()) visit(target);
      else if (stats.isFile()) {
        try {
          if (readFileSync(target).includes(needle)) found.push(target);
        } catch (cause) {
          if (!(cause instanceof Error) || !("code" in cause) || cause.code !== "EBUSY") throw cause;
        }
      }
    }
  };
  visit(root);
  return found;
}

test.describe("desktop companion full flow", () => {
  test.skip(!enabled, "로컬 QA 서버와 합성 계정이 필요합니다.");

  test("코드 로그인부터 근거·결정·웹 해제·끊김 질문 재전송까지", async ({ browser }) => {
    test.setTimeout(180_000);
    const local = localStatus();
    build(local);
    console.log("full-flow: built");
    const ids = JSON.parse(readFileSync(resolve(root, ".vercel/review-qa/ids.json"), "utf8")) as { lead: string; dept: string };
    const credentials = JSON.parse(readFileSync(resolve(root, ".vercel/review-qa/credentials.json"), "utf8")) as { password: string };
    const source = randomUUID();
    const item = randomUUID();
    const answer = randomUUID();
    const card = randomUUID();
    const quote = "데스크톱 전체 흐름에서 확인하는 합성 근거입니다.";
    const answerText = "원문 근거가 있어 데스크톱 답을 보여 줍니다.";
    const question = `데스크톱 전체 흐름 질문 ${answer.slice(0, 8)}`;
    const cardTitle = `데스크톱 전체 흐름 카드 ${card.slice(0, 8)}`;
    const offlineQuestion = "인터넷이 끊긴 전체 흐름 테스트 질문입니다.";
    const alertCardOne = randomUUID();
    const alertCardTwo = randomUUID();
    console.log("full-flow: fixture-start");
    sql(`
      update device_links set revoked_at=now(), revoked_reason='relink' where user_id='${ids.lead}' and revoked_at is null;
      update members set consented_at=now() where dept_id='${ids.dept}' and user_id='${ids.lead}';
      insert into sources(id,dept_id,kind,external_id,title,visibility,active,is_principles) values ('${source}','${ids.dept}','document','desktop-full-${source}','데스크톱 전체 흐름 자료','dept',true,false);
      insert into items(id,source_id,dept_id,content,author) values ('${item}','${source}','${ids.dept}','${quote}','합성 작성자');
      insert into answers(id,dept_id,asked_by,question,answer,status,verified,refused) values ('${answer}','${ids.dept}','${ids.lead}','${question}','${answerText}','done',true,false);
      insert into citations(owner_kind,owner_id,item_id,quote,ordinal) values ('answer','${answer}','${item}','${quote}',1);
      insert into decision_requests(id,dept_id,title,background,assignee_id,visibility,status,deadline) values ('${card}','${ids.dept}','${cardTitle}','합성 카드 배경','${ids.lead}','dept','open',now()+interval '1 day');
      insert into citations(owner_kind,owner_id,item_id,quote,ordinal) values ('decision_request','${card}','${item}','${quote}',1);
      notify pgrst,'reload schema';
    `);
    console.log("full-flow: fixture-ready");
    const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const userData = mkdtempSync(resolve(tmpdir(), "sasu-desktop-full-flow-"));
    const app = await electron.launch({
      args: [".", `--user-data-dir=${userData}`],
      executablePath: resolve(process.cwd(), "node_modules/electron/dist/electron.exe"),
      env: { ...process.env, SASU_APP_URL: "http://127.0.0.1:3011", SASU_DISABLE_UPDATER: "1" },
    });
    console.log("full-flow: electron-ready");
    let web: Awaited<ReturnType<typeof browser.newPage>> | null = null;
    try {
      const panel = app.windows().find((page) => page.url().includes("#panel"));
      const pet = app.windows().find((page) => page.url().includes("#pet"));
      expect(panel).toBeTruthy();
      expect(pet).toBeTruthy();
      const login = async (): Promise<void> => {
        await expect(panel!.getByRole("heading", { name: "사수 시작하기" })).toBeVisible();
        // The lean local QA stack has no Mailpit. Generate a one-time code
        // through the local Auth admin API, then exercise the app's normal
        // preload/IPC code-verification capability without reading mail.
        const otp = await admin.auth.admin.generateLink({ type: "magiclink", email: "review-lead@example.test" });
        expect(otp.error).toBeNull();
        await panel!.evaluate(async ({ email, code }) => {
          await window.sasu.auth.verifyCode(email, code);
        }, { email: "review-lead@example.test", code: otp.data.properties.email_otp! });
        const departments = await panel!.evaluate(async () => window.sasu.link.departments());
        expect(departments.departments.some((dept) => dept.id === ids.dept && dept.consented)).toBeTruthy();
        await panel!.evaluate(async (deptId) => {
          await window.sasu.link.create({
            dept_id: deptId,
            device_name: "데스크톱 앱",
          });
        }, ids.dept);
        await panel!.reload();
        await expect(panel!.getByRole("button", { name: "질문", exact: true })).toBeVisible();
      };
      await login();
      console.log("full-flow: linked");

      await pet!.evaluate(() => {
        const target = window as typeof window & {
          __sasuPetEvents?: Array<{ state: string; at: number }>;
        };
        target.__sasuPetEvents = [];
        window.sasu.window.onPetState((state) => target.__sasuPetEvents?.push({ state, at: Date.now() }));
      });
      await pet!.evaluate(() => {
        const target = window as typeof window & {
          __sasuNotificationTimes?: number[];
        };
        target.__sasuNotificationTimes = [];
        window.sasu.window.onE2ENotification((at) => target.__sasuNotificationTimes?.push(at));
      });
      // The first inbox response is the notification comparison baseline.
      // Observe that response before adding a card so both measurements
      // exercise a genuine change, rather than app startup.
      await expect.poll(
        () => pet!.evaluate(() => (window as typeof window & {
          __sasuPetEvents?: Array<{ state: string; at: number }>;
        }).__sasuPetEvents?.length ?? 0),
        { timeout: 60_000, intervals: [250, 500, 1_000, 2_000] },
      ).toBeGreaterThan(0);
      await pet!.evaluate(() => {
        (window as typeof window & {
          __sasuPetEvents?: Array<{ state: string; at: number }>;
        }).__sasuPetEvents = [];
      });
      await pet!.evaluate(() => {
        (window as typeof window & {
          __sasuNotificationTimes?: number[];
        }).__sasuNotificationTimes = [];
      });
      const insertAlertCard = (id: string, ordinal: number): void => {
        sql(`
          insert into decision_requests(id,dept_id,title,background,assignee_id,visibility,status,deadline)
          values ('${id}','${ids.dept}','알림 실측 카드 ${ordinal}','새 담당 카드 알림 실측','${ids.lead}','dept','open',now()+interval '1 day');
          insert into citations(owner_kind,owner_id,item_id,quote,ordinal)
          values ('decision_request','${id}','${item}','${quote}',1);
        `);
      };
      const assertCardAlert = async (id: string, ordinal: number): Promise<{ petMs: number; notificationMs: number }> => {
        const started = Date.now();
        insertAlertCard(id, ordinal);
        await expect.poll(
          () => pet!.evaluate((after) => (window as typeof window & {
            __sasuPetEvents?: Array<{ state: string; at: number }>;
          }).__sasuPetEvents?.find((event) => event.state === "needs_attention" && event.at >= after) ?? null, started),
          { timeout: 60_000, intervals: [250, 500, 1_000, 2_000] },
        ).not.toBeNull();
        const petEvent = await pet!.evaluate((after) => (window as typeof window & {
          __sasuPetEvents?: Array<{ state: string; at: number }>;
        }).__sasuPetEvents?.find((event) => event.state === "needs_attention" && event.at >= after) ?? null, started);
        await expect.poll(
          () => pet!.evaluate((after) => (window as typeof window & {
            __sasuNotificationTimes?: number[];
          }).__sasuNotificationTimes?.find((at) => at >= after) ?? null, started),
          { timeout: 60_000, intervals: [250, 500, 1_000, 2_000] },
        ).not.toBeNull();
        const notificationAt = await pet!.evaluate((after) => (window as typeof window & {
          __sasuNotificationTimes?: number[];
        }).__sasuNotificationTimes?.find((at) => at >= after) ?? null, started);
        const petMs = Number((petEvent as { at: number } | null)?.at) - started;
        const notificationMs = Number(notificationAt) - started;
        expect(petMs).toBeLessThanOrEqual(60_000);
        expect(notificationMs).toBeLessThanOrEqual(60_000);
        console.log(`full-flow: alert-${ordinal} pet=${petMs}ms notification=${notificationMs}ms`);
        return { petMs, notificationMs };
      };
      const firstAlert = await assertCardAlert(alertCardOne, 1);
      const secondAlert = await assertCardAlert(alertCardTwo, 2);
      expect(secondAlert.notificationMs).toBeLessThanOrEqual(60_000);
      expect(firstAlert.petMs).toBeLessThanOrEqual(60_000);

      await panel!.getByRole("button", { name: "기록" }).click();
      await panel!.getByRole("button", { name: "기록 불러오기" }).click();
      await panel!.getByRole("button", { name: question }).click();
      await expect(panel!.getByText(answerText)).toBeVisible();
      await expect(panel!.getByText(quote)).toBeVisible();
      await panel!.getByRole("button", { name: "결정함" }).click();
      await panel!.getByRole("button", { name: cardTitle }).click();
      await expect(panel!.getByRole("heading", { name: cardTitle })).toBeVisible();
      await panel!.getByLabel("결과").fill("전체 흐름 카드 결정 결과");
      await panel!.getByLabel("이유").fill("결정 연타가 한 건으로 저장되는지 확인합니다.");
      await panel!.getByRole("button", { name: "결정하기" }).dblclick();
      await expect(panel!.getByText(/결정이 결정 기록/u)).toBeVisible();
      expect(Number(sql(`select count(*) from decisions where request_id='${card}';`))).toBe(1);
      console.log("full-flow: citation-and-decision");

      web = await browser.newPage();
      const webClient = createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const signedIn = await webClient.auth.signInWithPassword({ email: "review-lead@example.test", password: credentials.password });
      expect(signedIn.error).toBeNull();
      const project = new URL(local.API_URL).hostname.split(".")[0];
      await web.context().addCookies([{ name: `sb-${project}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(signedIn.data.session), "utf8").toString("base64url")}`, url: "http://127.0.0.1:3011", httpOnly: true, sameSite: "Lax" }]);
      await web.goto(`http://127.0.0.1:3011/d/${ids.dept}/settings`);
      const row = web.getByText("데스크톱 앱", { exact: true }).locator("xpath=../..");
      await row.getByRole("button", { name: "연결 해제하기" }).click();
      await row.getByRole("button", { name: "해제", exact: true }).click();
      await expect(web.getByText("이 기기는 다음 요청부터 로그아웃돼요.")).toBeVisible();
      console.log("full-flow: web-revoked");
      await expect.poll(() => panel!.evaluate(() => window.sasu.inbox.get()).then(() => "ok").catch((error: Error) => error.message)).toContain("로그인이 만료");
      await expect(panel!.getByRole("heading", { name: "사수 시작하기" })).toBeVisible();
      console.log("full-flow: app-revoked");

      await login();
      await panel!.getByRole("button", { name: "질문", exact: true }).click();
      await app.evaluate(({ session }) => {
        session.defaultSession.webRequest.onBeforeRequest(
          { urls: ["http://127.0.0.1:3011/api/companion/ask*"] },
          (_details, callback) => callback({ cancel: true }),
        );
        session.defaultSession.enableNetworkEmulation({ offline: true });
      });
      await panel!.getByPlaceholder("질문을 적어 주세요.").fill(offlineQuestion);
      await panel!.getByRole("button", { name: "질문하기" }).click();
      await expect(panel!.getByText("연결되면 보낼게요.")).toBeVisible();
      const outboxPath = resolve(userData, "outbox.bin");
      expect(readFileSync(outboxPath).includes(Buffer.from(offlineQuestion))).toBe(false);
      expect(plaintextFiles(userData, offlineQuestion)).toEqual([]);
      console.log("full-flow: queued");
      await app.evaluate(({ session }) => {
        session.defaultSession.enableNetworkEmulation({ offline: false });
        session.defaultSession.webRequest.onBeforeRequest(null);
      });
      await expect.poll(() => panel!.evaluate(() => window.sasu.inbox.get())).toMatchObject({ outbox_count: 0 });
      expect(existsSync(outboxPath)).toBe(false);
      console.log("full-flow: flushed");
    } finally {
      await app.evaluate(({ session }) => session.defaultSession.enableNetworkEmulation({ offline: false })).catch(() => undefined);
      await web?.close();
      await app.close();
      rmSync(userData, { recursive: true, force: true });
      sql(`
        delete from citations where owner_id in ('${answer}', '${card}', '${alertCardOne}', '${alertCardTwo}');
        delete from answers where id='${answer}';
        delete from decisions where request_id='${card}';
        delete from decision_requests where id='${card}';
        delete from decision_requests where id in ('${alertCardOne}', '${alertCardTwo}');
        delete from items where id='${item}';
        delete from sources where id='${source}';
        update device_links set revoked_at=now(), revoked_reason='signout' where user_id='${ids.lead}' and revoked_at is null;
      `);
    }
  });
});
