import { test, expect, _electron as electron } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.SASU_DESKTOP_E2E === "1";
const repoRoot = resolve(process.cwd(), "..");

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

test.describe("desktop companion smoke", () => {
  test.skip(
    !enabled,
    "로컬 QA 서버·합성 OTP 계정을 준비한 뒤 SASU_DESKTOP_E2E=1로 실행합니다.",
  );

  test("코드 로그인부터 답 근거 확인과 카드 결정까지 처리한다", async () => {
    const local = status();
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
    sql(`
      update members set consented_at=now() where dept_id='${ids.dept}' and user_id='${ids.lead}';
      insert into sources(id,dept_id,kind,external_id,title,visibility,active,is_principles) values ('${source}','${ids.dept}','document','desktop-e2e-${source}','데스크톱 합성 자료','dept',true,false);
      insert into items(id,source_id,dept_id,content,author) values ('${item}','${source}','${ids.dept}','${quote}','합성 작성자');
      insert into answers(id,dept_id,asked_by,question,answer,status,verified,refused) values ('${answer}','${ids.dept}','${ids.lead}','데스크톱 합성 질문','${body}','done',true,false);
      insert into citations(owner_kind,owner_id,item_id,quote,ordinal) values ('answer','${answer}','${item}','${quote}',1);
      insert into decision_requests(id,dept_id,title,background,assignee_id,visibility,status,deadline) values ('${card}','${ids.dept}','데스크톱에서 결정할 카드','합성 카드 배경','${ids.lead}','dept','open',now()+interval '1 day');
      notify pgrst,'reload schema';
    `);
    console.log("e2e fixture");
    const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const app = await electron.launch({
      args: ["."],
      executablePath:
        process.env.ELECTRON_EXECUTABLE_PATH ??
        resolve(process.cwd(), "node_modules/electron/dist/electron.exe"),
      env: { ...process.env, SASU_APP_URL: "http://127.0.0.1:3011" },
    });
    console.log("e2e electron");
    try {
      const pet = app.windows().find((page) => page.url().includes("#pet"));
      const panel = app.windows().find((page) => page.url().includes("#panel"));
      expect(pet).toBeTruthy();
      expect(panel).toBeTruthy();
      console.log("e2e windows");
      await pet!.getByRole("button", { name: "사수 펫" }).click();
      await expect(
        panel!.getByRole("heading", { name: "사수 시작하기" }),
      ).toBeVisible();
      console.log("e2e login");
      await panel!.getByLabel("이메일").fill("review-lead@example.test");
      await panel!.getByRole("button", { name: "코드 받기" }).click();
      const generated = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: "review-lead@example.test",
      });
      expect(generated.error).toBeNull();
      console.log("e2e verified");
      await panel!
        .getByLabel("6자리 코드")
        .fill(generated.data.properties.email_otp!);
      await panel!.getByRole("button", { name: "로그인하기" }).click();
      await panel!.waitForTimeout(1_000);
      console.log("e2e departments", await panel!.locator("body").innerText());
      await panel!
        .getByRole("button", { name: "자료 검토 QA" })
        .first()
        .click();
      console.log("e2e linked");
      await panel!.getByRole("button", { name: "기록" }).click();
      await panel!.getByRole("button", { name: "기록 불러오기" }).click();
      await panel!.getByRole("button", { name: /데스크톱 합성 질문/u }).click();
      await expect(panel!.getByText(body)).toBeVisible();
      await expect(panel!.getByText(quote)).toBeVisible();
      console.log("e2e history");
      await panel!.getByRole("button", { name: "결정함" }).click();
      await panel!
        .getByRole("button", { name: /데스크톱에서 결정할 카드/u })
        .click();
      await panel!.getByLabel("결과").fill("합성 카드 결정 결과");
      await panel!
        .getByLabel("이유")
        .fill("결정 연타가 한 건으로 저장되는지 확인합니다.");
      await panel!.getByRole("button", { name: "결정하기" }).dblclick();
      await expect(panel!.getByText("처리했습니다.")).toBeVisible();
      expect(
        Number(
          sql(`select count(*) from decisions where request_id='${card}';`),
        ),
      ).toBe(1);
    } finally {
      await app.close();
      sql(
        `delete from citations where owner_id='${answer}'; delete from answers where id='${answer}'; delete from decisions where request_id='${card}'; delete from decision_requests where id='${card}'; delete from items where id='${item}'; delete from sources where id='${source}';`,
      );
    }
  });
});
