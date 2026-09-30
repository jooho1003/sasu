import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: ["recording-product.spec.ts", "demo-meeting-recorder.spec.ts", "demo-reviewer.spec.ts"],
  workers: 1,
  use: { ...devices["Desktop Chrome"], channel: "chrome", baseURL: "http://127.0.0.1:3200", screenshot: "only-on-failure" },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3200",
    url: "http://127.0.0.1:3200",
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
