import { describe, expect, it } from "vitest";
import { baselineSecurityHeaders, contentSecurityPolicy } from "@/lib/security-headers";

describe("security response headers", () => {
  it("restricts embedding, sniffing and capture permissions", () => {
    const headers = Object.fromEntries(baselineSecurityHeaders().map(({ key, value }) => [key, value]));
    expect(headers["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toBe("microphone=(self), display-capture=(self), camera=(), geolocation=()");
  });
  it("allows only the configured Supabase origin and its websocket origin", () => {
    const policy = contentSecurityPolicy("YWJjMTIz", "https://project.supabase.co/path?ignored=yes", false);
    expect(policy).toContain("connect-src 'self' https://project.supabase.co wss://project.supabase.co;");
    expect(policy).toContain("script-src 'self' 'nonce-YWJjMTIz' 'strict-dynamic';");
    expect(policy).toContain("media-src 'self' blob: https://project.supabase.co;");
    expect(policy).toContain("worker-src 'self' blob:;");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toContain("path?");
  });
  it.each(["https://evil.test'; script-src *", "data:text/plain,x", "https://user:password@project.supabase.co", "garbage"])("rejects an invalid public backend URL: %s", (url) => {
    expect(() => contentSecurityPolicy("YWJjMTIz", url, false)).toThrow("invalid_supabase_origin");
  });
  it("allows local development connections without relaxing production scripts", () => {
    expect(contentSecurityPolicy("YWJjMTIz", "http://127.0.0.1:54321", true)).toContain("ws://127.0.0.1:54321");
    expect(contentSecurityPolicy("YWJjMTIz", undefined, true)).toContain("'unsafe-eval'");
    expect(() => contentSecurityPolicy("bad'; *", undefined, false)).toThrow("invalid_nonce");
  });
});
