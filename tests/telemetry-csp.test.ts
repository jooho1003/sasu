import { expect, it } from "vitest";
import { contentSecurityPolicy } from "@/lib/security-headers";

it("allows configured telemetry collectors without broad wildcards or DSN credentials", () => {
  const policy = contentSecurityPolicy("YWJjMTIz", undefined, false, { ga4: true, sentryDsn: "https://abc@o1.ingest.us.sentry.io/123" });
  expect(policy).toContain("https://www.google-analytics.com");
  expect(policy).toContain("https://region1.google-analytics.com");
  expect(policy).toContain("https://o1.ingest.us.sentry.io");
  expect(policy).not.toMatch(/abc@|\*\.sentry|unsafe-inline.*script/);
  expect(contentSecurityPolicy("YWJjMTIz", undefined, false)).not.toMatch(/sentry|google-analytics/);
});
