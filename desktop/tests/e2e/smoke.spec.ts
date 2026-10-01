import { test, expect, _electron as electron } from "@playwright/test";
import { resolve } from "node:path";

const enabled = process.env.SASU_DESKTOP_E2E === "1";

test.describe("desktop companion smoke", () => {
  test.skip(!enabled, "로컬 QA 서버·합성 OTP 계정을 준비한 뒤 SASU_DESKTOP_E2E=1로 실행합니다.");

  test("로그인 화면에서 펫과 패널 창을 연다", async () => {
    const app = await electron.launch({
      args: ["."],
      executablePath: process.env.ELECTRON_EXECUTABLE_PATH ?? resolve(process.cwd(), "node_modules/electron/dist/electron.exe"),
      env: {
        ...process.env,
        SASU_APP_URL: process.env.SASU_APP_URL ?? "http://localhost:3011",
      },
    });
    const windows = app.windows();
    expect(windows).toHaveLength(2);
    const panel = windows.find((page) => page.url().includes("#panel"));
    expect(panel).toBeTruthy();
    await expect(panel!).toHaveTitle(/사수/u);
    await app.close();
  });
});
