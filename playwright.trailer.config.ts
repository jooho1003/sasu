import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  use: { ...devices["Desktop Chrome"], screenshot: "only-on-failure" },
  webServer: [
    {
      command: "npm run start -- --port 3107",
      url: "http://localhost:3107/trailers",
      env: { SASU_TRAILER_PREVIEW_ENABLED: "true" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm run start -- --port 3108",
      url: "http://localhost:3108",
      env: { SASU_TRAILER_PREVIEW_ENABLED: "false" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: "trailer-enabled", testMatch: "trailer.spec.ts", use: { baseURL: "http://localhost:3107" } },
    { name: "trailer-disabled", testMatch: "trailer-disabled.spec.ts", use: { baseURL: "http://localhost:3108" } },
    { name: "trailer-invites-disabled", testMatch: "trailer-invites.spec.ts", use: { baseURL: "http://localhost:3107" } },
  ],
});
