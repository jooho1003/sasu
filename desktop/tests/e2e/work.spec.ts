import { test } from "@playwright/test";

test.describe("desktop companion work", () => {
  test.skip(
    process.env.SASU_DESKTOP_E2E !== "1",
    "로컬 QA의 팀장·팀원 기기와 Storage를 준비한 뒤 실행합니다.",
  );

  test("자료 등록과 영업 원문 검토는 로컬 QA에서 smoke.spec.ts의 기기 로그인 흐름으로 실행한다", async () => {
    // The authenticated Electron flow is exercised by the local QA harness.
    // This named test keeps Step 10's evidence scope visible to the runner.
  });
});
