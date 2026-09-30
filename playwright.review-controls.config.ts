import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/review-controls", workers: 1, timeout: 120_000,
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3192", screenshot: "only-on-failure" },
  webServer: { command: "npx vite scripts/review-controls-lab --config scripts/review-controls-lab/vite.config.ts --host 127.0.0.1 --port 3192 --strictPort", url: "http://127.0.0.1:3192", reuseExistingServer: false, timeout: 180_000 },
});
