import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/telemetry/config/route";

afterEach(() => vi.unstubAllEnvs());
describe("public telemetry configuration", () => {
  it("only discloses validated public DSN and environment, never auth tokens", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SENTRY_DSN", "https://abc@o1.ingest.de.sentry.io/123");
    vi.stubEnv("SENTRY_AUTH_TOKEN", "SECRET_CANARY");
    const response = GET();
    expect(await response.json()).toEqual({ dsn: "https://abc@o1.ingest.de.sentry.io/123", environment: "production" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("never enables preview even when local test mode was accidentally set", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("SASU_TELEMETRY_TEST_ENABLED", "true");
    vi.stubEnv("SENTRY_DSN", "https://abc@o1.ingest.de.sentry.io/123");
    expect((await GET().json()).dsn).toBeNull();
  });
});
