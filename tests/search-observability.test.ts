import { describe, expect, it } from "vitest";
import { publicPaths, publicFaq, isIndexable, structuredData, llmsText } from "@/lib/search-discovery";
import { analyticsId, analyticsPage, sanitizeSentryEvent, sentryDsn, telemetryEnabled } from "@/lib/telemetry";

describe("public discovery", () => {
  it("indexes only exact public paths and never previews", () => {
    expect(publicPaths).toEqual(["/", "/demo", "/privacy"]);
    for (const path of publicPaths) expect(isIndexable(path, {})).toBe(true);
    for (const path of ["/d/sales", "/demo/access", "/login", "/auth/confirm", "/t/i/token", "/api/jobs/run", "/missing"]) expect(isIndexable(path, {})).toBe(false);
    expect(isIndexable("/", { VERCEL_ENV: "preview" })).toBe(false);
  });
  it("uses the same FAQ for visible text and JSON-LD without invented claims", () => {
    const graph = structuredData(new URL("https://getsasu.com/"))["@graph"];
    const faq = graph.find((entry) => entry["@type"] === "FAQPage")!;
    expect(faq.mainEntity).toEqual(publicFaq.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })));
    expect(JSON.stringify(graph)).not.toMatch(/aggregateRating|price|ratingValue/);
    expect(llmsText(new URL("https://getsasu.com/"))).toContain("https://getsasu.com/privacy");
    expect(llmsText(new URL("https://getsasu.com/"))).not.toMatch(/\/d\/|\/t\/i\//);
  });
});

describe("telemetry privacy", () => {
  it("rejects malformed IDs and DSNs, only enables configured environments", () => {
    expect(analyticsId(" G-ABC123 ")).toBe("G-ABC123");
    expect(analyticsId("G-ABC';alert(1)")).toBeNull();
    expect(sentryDsn("https://abc@o1.ingest.us.sentry.io/123")).toBe("https://abc@o1.ingest.us.sentry.io/123");
    for (const value of ["https://abc:secret@o1.ingest.sentry.io/123", "https://evil.test/123", "https://abc@sentry.io.evil.test/123", "bad"]) expect(sentryDsn(value)).toBeNull();
    expect(telemetryEnabled({ VERCEL_ENV: "preview", SASU_TELEMETRY_TEST_ENABLED: "true" })).toBe(false);
    expect(telemetryEnabled({ VERCEL_ENV: "production" })).toBe(true);
    expect(telemetryEnabled({ NODE_ENV: "development" })).toBe(false);
  });
  it("drops private routes and strips queries, hash and arbitrary page titles", () => {
    expect(analyticsPage("/demo?email=secret#token", "https://getsasu.com/")).toEqual({ page_location: "https://getsasu.com/demo", page_title: "사수 체험", page_referrer: "" });
    expect(analyticsPage("/auth/confirm?token_hash=secret", "https://getsasu.com/")).toBeNull();
    expect(analyticsPage("/demo/access", "https://getsasu.com/")).toBeNull();
  });
  it("reconstructs errors without request data, user data, source content or error messages", () => {
    const event = sanitizeSentryEvent({
      event_id: "abc", timestamp: 1, environment: "production", level: "error", platform: "javascript",
      request: { url: "https://getsasu.com/auth/confirm?token_hash=secret", headers: { authorization: "Bearer secret" }, data: "업무 원문" },
      message: "이메일 secret@example.com", user: { email: "secret@example.com" }, extra: { original: "업무 원문" }, contexts: { custom: { token: "secret" } }, breadcrumbs: [{ message: "질문 원문" }],
      exception: { values: [{ type: "Error", value: "슬랙 원문", stacktrace: { frames: [{ filename: "https://getsasu.com/_next/static/chunks/test.js?secret", lineno: 5, colno: 2, function: "ask", vars: { password: "secret" }, pre_context: ["원문"], context_line: "업무 원문" }] } }] },
    });
    expect(JSON.stringify(event)).not.toMatch(/secret|원문|token_hash|authorization|breadcrumbs|vars|context_line/);
    expect(event.exception?.values?.[0].value).toBe("application_error");
    expect(event.exception?.values?.[0].stacktrace?.frames?.[0]).toEqual({ filename: "https://getsasu.com/_next/static/chunks/test.js", lineno: 5, colno: 2 });
  });
  it("omits empty stack traces to keep the Sentry event schema valid", () => {
    const event = sanitizeSentryEvent({ exception: { values: [{ type: "Error", value: "CANARY" }] } });
    expect(event.exception.values?.[0]).not.toHaveProperty("stacktrace");
  });
});
