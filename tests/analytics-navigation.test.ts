import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/components/sentry-client", () => ({ initializeClientErrors: vi.fn(async () => {}) }));
import { onRouterTransitionStart } from "@/instrumentation-client";

afterEach(() => vi.unstubAllGlobals());
it("disables an active Google tag before a programmatic private route transition", () => {
  const browser = { location: { origin: "https://getsasu.com" }, "ga-disable-G-ABC123": false };
  vi.stubGlobal("window", browser);
  onRouterTransitionStart("/privacy");
  expect(browser["ga-disable-G-ABC123"]).toBe(false);
  onRouterTransitionStart("/d/sales?question=CANARY");
  expect(browser["ga-disable-G-ABC123"]).toBe(true);
});
