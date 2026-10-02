import { test, expect, _electron as electron } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.SASU_DESKTOP_E2E === "1";
const repoRoot = resolve(process.cwd(), "..");

async function desktopWindows(app: Awaited<ReturnType<typeof electron.launch>>) {
  await expect.poll(() => app.windows().filter((page) => page.url().includes("#")).length).toBe(2);
  return {
    pet: app.windows().find((page) => page.url().includes("#pet"))!,
    panel: app.windows().find((page) => page.url().includes("#panel"))!,
  };
}

function status(): Record<string, string> {
  const command = process.platform === "win32" ? "cmd.exe" : "npx";
  const args =
    process.platform === "win32"
      ? [
          "/d",
          "/s",
          "/c",
          "npx --yes supabase status --workdir .vercel/review-qa -o json",
        ]
      : [
          "--yes",
          "supabase",
          "status",
          "--workdir",
          ".vercel/review-qa",
          "-o",
          "json",
        ];
  const output = execFileSync(command, args, {
    encoding: "utf8",
    cwd: repoRoot,
  });
  return JSON.parse(output.slice(output.indexOf("{"))) as Record<
    string,
    string
  >;
}

function sql(query: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_review-qa",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-q",
    ],
    { input: query, encoding: "utf8" },
  ).trim();
}

function buildForQa(local: Record<string, string>): void {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm run build"]
      : ["run", "build"];
  execFileSync(command, args, {
    cwd: resolve(repoRoot, "desktop"),
    env: {
      ...process.env,
      SASU_APP_URL: "http://127.0.0.1:3011",
      SUPABASE_URL: local.API_URL,
      SUPABASE_ANON_KEY: local.ANON_KEY,
    },
    stdio: "inherit",
  });
}

test.describe("desktop companion smoke", () => {
  test.skip(
    !enabled,
    "로컬 QA 서버·합성 OTP 계정을 준비한 뒤 SASU_DESKTOP_E2E=1로 실행합니다.",
  );

  test("펫 상태 다섯 가지를 화면으로 남긴다", async () => {
    test.setTimeout(30_000);
    const local = status();
    buildForQa(local);
    const screenshotDir = resolve(
      repoRoot,
      "docs/verification/43-desktop-companion/screenshots",
    );
    const userData = mkdtempSync(resolve(tmpdir(), "sasu-desktop-pet-"));
    mkdirSync(screenshotDir, { recursive: true });
    const app = await electron.launch({
      args: [".", `--user-data-dir=${userData}`],
      executablePath:
        process.env.ELECTRON_EXECUTABLE_PATH ??
        resolve(process.cwd(), "node_modules/electron/dist/electron.exe"),
    });
    try {
      const { pet, panel } = await desktopWindows(app);
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows().find(
          (window) => window.getBounds().width === 380,
        )?.hide();
      });
      await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
        !BrowserWindow.getAllWindows().some(
          (window) => window.getBounds().width === 380 && window.isVisible(),
        ),
      )).toBe(true);
      await pet.waitForTimeout(250);
      await pet!.getByRole("button", { name: "사수 펫" }).click();
      await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some(
          (window) => window.getBounds().width === 380 && window.isVisible(),
        ),
      )).toBe(true);
      console.log("e2e pet click -> panel visible");
      await panel.screenshot({
        path: resolve(screenshotDir, "desktop-pet-panel-visible.png"),
      });
      for (const state of [
        "idle",
        "working",
        "complete",
        "needs_attention",
        "failed",
      ]) {
        await app.evaluate(
          ({ BrowserWindow }, petState) => {
            const petWindow = BrowserWindow.getAllWindows().find(
              (window) => window.getBounds().width === 128,
            );
            petWindow?.webContents.send("pet-state", petState);
          },
          state,
        );
        await pet!.waitForTimeout(100);
        await pet!.screenshot({
          path: resolve(screenshotDir, `desktop-ui-pet-${state}.png`),
        });
      }
    } finally {
      await app.close();
      rmSync(userData, { recursive: true, force: true });
    }
  });

  test("탭 다섯 가지를 화면에서 연다", async () => {
    test.setTimeout(60_000);
    const local = status();
    buildForQa(local);
    const ids = JSON.parse(
      readFileSync(resolve(repoRoot, ".vercel/review-qa/ids.json"), "utf8"),
    ) as { lead: string; dept: string };
    const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const [label, file, heading] of [
      ["질문", "ask", "무엇이 궁금한가요?"],
      ["결정함", "cards", "결정할 카드"],
      ["기록", "history", "지난 질문"],
      ["일 맡기기", "work", "일 맡기기"],
      ["설정", "settings", "설정"],
    ] as const) {
      sql(`update device_links set revoked_at=now(), revoked_reason='relink' where user_id='${ids.lead}' and revoked_at is null;`);
      const userData = mkdtempSync(resolve(tmpdir(), "sasu-desktop-tab-"));
      const app = await electron.launch({
        args: [".", `--user-data-dir=${userData}`],
        executablePath:
          process.env.ELECTRON_EXECUTABLE_PATH ??
          resolve(process.cwd(), "node_modules/electron/dist/electron.exe"),
      });
      try {
        const { pet, panel } = await desktopWindows(app);
        await pet!.getByRole("button", { name: "사수 펫" }).click();
        const generated = await admin.auth.admin.generateLink({
          type: "magiclink",
          email: "review-lead@example.test",
        });
        expect(generated.error).toBeNull();
        await panel!.evaluate(
          async ({ email, code, deptId }) => {
            await window.sasu.auth.verifyCode(email, code);
            await window.sasu.link.create({
              dept_id: deptId,
            });
          },
          {
            email: "review-lead@example.test",
            code: generated.data.properties.email_otp!,
            deptId: ids.dept,
          },
        );
        await panel!.reload();
        await expect(
          panel!.getByRole("button", { name: "질문", exact: true }),
        ).toBeVisible();
        if (label !== "질문") {
          await panel!
            .getByRole("button", { name: label })
            .evaluate((button: HTMLButtonElement) => button.click());
        }
        await expect(
          panel!.getByRole("heading", { name: heading }),
        ).toBeVisible();
        if (label === "설정") {
          await panel!.screenshot({
            path: resolve(repoRoot, "docs/verification/43-desktop-companion/screenshots/desktop-settings.png"),
          });
        }
        console.log(`e2e tab ${file}`);
      } finally {
        await app.close();
        rmSync(userData, { recursive: true, force: true });
      }
    }
    sql(`update device_links set revoked_at=now(), revoked_reason='relink' where user_id='${ids.lead}' and revoked_at is null;`);
  });

  test("코드 로그인부터 답 근거 확인과 카드 결정까지 처리한다", async () => {
    test.setTimeout(60_000);
    const local = status();
    buildForQa(local);
    console.log("e2e status");
    const ids = JSON.parse(
      readFileSync(resolve(repoRoot, ".vercel/review-qa/ids.json"), "utf8"),
    ) as { lead: string; dept: string };
    const source = randomUUID();
    const item = randomUUID();
    const answer = randomUUID();
    const card = randomUUID();
    const quote = "데스크톱 화면에서 확인하는 합성 근거입니다.";
    const body = "근거가 확인되어 데스크톱 답 본문을 보여 줍니다.";
    const question = `데스크톱 합성 질문 ${answer.slice(0, 8)}`;
    const cardTitle = `데스크톱에서 결정할 카드 ${card.slice(0, 8)}`;
    sql(`
      update device_links set revoked_at=now(), revoked_reason='relink'
      where user_id='${ids.lead}' and revoked_at is null;
      update members set consented_at=now() where dept_id='${ids.dept}' and user_id='${ids.lead}';
      insert into sources(id,dept_id,kind,external_id,title,visibility,active,is_principles) values ('${source}','${ids.dept}','document','desktop-e2e-${source}','데스크톱 합성 자료','dept',true,false);
      insert into items(id,source_id,dept_id,content,author) values ('${item}','${source}','${ids.dept}','${quote}','합성 작성자');
      insert into answers(id,dept_id,asked_by,question,answer,status,verified,refused) values ('${answer}','${ids.dept}','${ids.lead}','${question}','${body}','done',true,false);
      insert into citations(owner_kind,owner_id,item_id,quote,ordinal) values ('answer','${answer}','${item}','${quote}',1);
      insert into decision_requests(id,dept_id,title,background,assignee_id,visibility,status,deadline) values ('${card}','${ids.dept}','${cardTitle}','합성 카드 배경','${ids.lead}','dept','open',now()+interval '1 day');
      insert into citations(owner_kind,owner_id,item_id,quote,ordinal) values ('decision_request','${card}','${item}','${quote}',1);
      notify pgrst,'reload schema';
    `);
    console.log("e2e fixture");
    const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userData = mkdtempSync(resolve(tmpdir(), "sasu-desktop-e2e-"));
    const app = await electron.launch({
      args: [".", `--user-data-dir=${userData}`],
      executablePath:
        process.env.ELECTRON_EXECUTABLE_PATH ??
        resolve(process.cwd(), "node_modules/electron/dist/electron.exe"),
      env: { ...process.env, SASU_APP_URL: "http://127.0.0.1:3011" },
    });
    try {
      const pet = app.windows().find((page) => page.url().includes("#pet"));
      const panel = app.windows().find((page) => page.url().includes("#panel"));
      expect(pet).toBeTruthy();
      expect(panel).toBeTruthy();
      await pet!.getByRole("button", { name: "사수 펫" }).click();
      await expect(
        panel!.getByRole("heading", { name: "사수 시작하기" }),
      ).toBeVisible();
      await panel!.getByLabel("이메일").fill("review-lead@example.test");
      await panel!.getByRole("button", { name: "코드 받기" }).click();
      const generated = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: "review-lead@example.test",
      });
      expect(generated.error).toBeNull();
      await panel!
        .getByLabel("6자리 코드")
        .fill(generated.data.properties.email_otp!);
      await panel!.getByRole("button", { name: "로그인하기" }).click();
      await panel!.waitForTimeout(1_000);
      await panel!.locator(`[data-dept-id="${ids.dept}"]`).click();
      await panel!.waitForTimeout(500);
      await panel!.bringToFront();
      await panel!.getByRole("button", { name: "고정하기" }).click();
      await expect(panel!.getByRole("button", { name: "고정 풀기" })).toBeVisible();
      console.log("e2e code login and department selection completed");
      await panel!
        .getByRole("button", { name: "기록" })
        .evaluate((button: HTMLButtonElement) => button.click());
      await panel!
        .getByRole("button", { name: "기록 불러오기" })
        .evaluate((button: HTMLButtonElement) => button.click());
      const historyEntry = panel!.getByRole("button", { name: question });
      await expect(historyEntry).toBeVisible();
      await historyEntry
        .evaluate((button: HTMLButtonElement) => button.click());
      await expect(panel!.getByText(body)).toBeVisible();
      await expect(panel!.getByText(quote)).toBeVisible();
      console.log("e2e answer body and citation displayed");
      await panel!
        .getByRole("button", { name: "결정함" })
        .evaluate((button: HTMLButtonElement) => button.click());
      await panel!
        .getByRole("button", { name: cardTitle })
        .evaluate((button: HTMLButtonElement) => button.click());
      await expect(panel!.getByLabel("결과")).toBeVisible();
      await panel!.getByLabel("결과").fill("합성 카드 결정 결과");
      await panel!
        .getByLabel("이유")
        .fill("결정 연타가 한 건으로 저장되는지 확인합니다.");
      await panel!.getByRole("button", { name: "결정하기" }).dblclick();
      await expect(panel!.getByText(/결정이 결정 기록/u)).toBeVisible();
      const decisionCount = Number(
        sql(`select count(*) from decisions where request_id='${card}';`),
      );
      console.log(`e2e decisions ${decisionCount}`);
      expect(decisionCount).toBe(1);
    } finally {
      await app.close();
      rmSync(userData, { recursive: true, force: true });
      sql(
        `delete from citations where owner_id in ('${answer}', '${card}'); delete from answers where id='${answer}'; delete from decisions where request_id='${card}'; delete from decision_requests where id='${card}'; delete from items where id='${item}'; delete from sources where id='${source}';`,
      );
    }
  });
});
