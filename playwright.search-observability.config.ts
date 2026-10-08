import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e", testMatch: process.env.SASU_LIVE_TELEMETRY_CHECK === "true" ? "telemetry-live.spec.ts" : "search-observability.spec.ts", workers: 1,
  outputDir: "test-results/search-observability",
  reporter: [["list"], ["json", { outputFile: "docs/verification/52-search-observability/e2e-results.json" }]],
  use: { baseURL: "http://127.0.0.1:3192", screenshot: "only-on-failure" },
  webServer: {
    command: "node node_modules/next/dist/bin/next start --port 3192",
    url: "http://127.0.0.1:3192", reuseExistingServer: false, timeout: 300_000,
    env: { SASU_VERIFY_BUILD: "1", SASU_TELEMETRY_TEST_ENABLED: "true", GA4_MEASUREMENT_ID: process.env.SASU_LIVE_TELEMETRY_CHECK === "true" ? process.env.GA4_MEASUREMENT_ID ?? "" : "G-TEST123", SENTRY_DSN: process.env.SASU_LIVE_TELEMETRY_CHECK === "true" ? process.env.SENTRY_DSN ?? "" : "", NEXT_PUBLIC_APP_URL: "https://getsasu.com", SASU_CSP_ENFORCE: "true" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
