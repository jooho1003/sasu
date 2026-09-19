import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/recording",
  testMatch: "**/*.spec.ts",
  workers: 1,
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3191", screenshot: "only-on-failure" },
  webServer: {
    command: "npx vite scripts/recording-lab --config scripts/recording-lab/vite.config.ts --host 127.0.0.1 --port 3191 --strictPort",
    url: "http://127.0.0.1:3191",
    reuseExistingServer: false,
  },
});
