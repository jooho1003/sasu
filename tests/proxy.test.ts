import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({ create: vi.fn(), claims: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mock.create }));
import { proxy } from "@/proxy";
afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-public-key");
  vi.stubEnv("SASU_TRAILER_PUBLISH_ENABLED", "false");
  vi.stubEnv("SASU_CSP_ENFORCE", "false");
  mock.create.mockReset().mockReturnValue({ auth: { getClaims: mock.claims } });
  mock.claims.mockReset().mockResolvedValue({ data: { claims: {} } });
});

describe("request nonce and session boundaries", () => {
  it.each(["/", "/privacy", "/demo/notion", "/d/sales/trailers"])("enforces the same request policy when explicitly enabled: %s", async path => {
    vi.stubEnv("SASU_CSP_ENFORCE", "true");
    const response = await proxy(new NextRequest(`https://sasu.test${path}`));
    const policy = response.headers.get("Content-Security-Policy");
    expect(policy).toContain("nonce-");
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    if (response.status !== 404)
      expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("keeps enforcement on refreshed sessions and reviewer rejection", async () => {
    vi.stubEnv("SASU_CSP_ENFORCE", "true");
    mock.create.mockImplementation((_url, _key, options) => {
      options.cookies.setAll([{ name: "auth-test", value: "refreshed", options: { httpOnly: true } }], { "cache-control": "private, no-store" });
      return { auth: { getClaims: mock.claims } };
    });
    const response = await proxy(new NextRequest("https://sasu.test/d/sales"));
    expect(response.headers.get("Content-Security-Policy")).toContain("nonce-");
    expect(response.headers.get("set-cookie")).toContain("auth-test=refreshed");
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(response.headers.get("Content-Security-Policy"));
    mock.claims.mockResolvedValue({ data: { claims: { sub: "99999999-9999-4999-8999-999999999991" } } });
    const blocked = await proxy(new NextRequest("https://sasu.test/api/d/sales/reviews", { method: "POST" }));
    expect(blocked.status).toBe(403);
    expect(blocked.headers.get("Content-Security-Policy")).toContain("nonce-");
    expect(blocked.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
  });
  it("creates distinct report-only nonces without querying auth on public pages", async () => {
    const request = () => new NextRequest("https://sasu.test/", { headers: { "x-nonce": "attacker", "Content-Security-Policy": "script-src *" } });
    const first = await proxy(request());
    const second = await proxy(request());
    const policy = first.headers.get("Content-Security-Policy-Report-Only");
    expect(policy).toContain("nonce-");
    expect(policy).not.toBe(second.headers.get("Content-Security-Policy-Report-Only"));
    expect(policy).not.toContain("attacker");
    expect(first.headers.get("Content-Security-Policy")).toBeNull();
    expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
    expect(first.headers.get("Cache-Control")).toContain("no-store");
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("keeps the nonce on cookie refresh and authenticates protected requests", async () => {
    mock.create.mockImplementation((_url, _key, options) => {
      options.cookies.setAll([{ name: "auth-test", value: "refreshed", options: { httpOnly: true } }], { "cache-control": "private, no-store" });
      return { auth: { getClaims: mock.claims } };
    });
    const response = await proxy(new NextRequest("https://sasu.test/d/sales"));
    expect(mock.claims).toHaveBeenCalledOnce();
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toContain("nonce-");
    expect(response.headers.get("set-cookie")).toContain("auth-test=refreshed");
    expect(response.headers.get("x-middleware-request-cookie")).toContain("auth-test=refreshed");
  });
  it("keeps the report-only policy on disabled-feature errors", async () => {
    const response = await proxy(new NextRequest("https://sasu.test/d/sales/trailers"));
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toContain("nonce-");
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("retains the reviewer write rejection", async () => {
    mock.claims.mockResolvedValue({ data: { claims: { sub: "99999999-9999-4999-8999-999999999991" } } });
    const response = await proxy(new NextRequest("https://sasu.test/api/d/sales/reviews", { method: "POST" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "demo_read_only" });
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toContain("nonce-");
  });
  it("keeps candidate invite pages sessionless and gives only that page no-referrer", async () => {
    const token = "a".repeat(64);
    const pageResponse = await proxy(new NextRequest(`https://sasu.test/t/i/${token}`, {
      headers: { cookie: "reviewer-auth-token=present" },
    }));
    expect(pageResponse.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(mock.create).not.toHaveBeenCalled();

    const apiResponse = await proxy(new NextRequest("https://sasu.test/api/t/i/open", {
      method: "POST",
      headers: { cookie: "reviewer-auth-token=present" },
    }));
    expect(apiResponse.status).toBe(200);
    expect(apiResponse.headers.get("Referrer-Policy")).not.toBe("no-referrer");
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("gives the mail login confirm route no-referrer at the proxy, where next.config headers cannot override it", async () => {
    const confirm = await proxy(new NextRequest("https://sasu.test/auth/confirm?token_hash=abc&type=email"));
    expect(confirm.headers.get("Referrer-Policy")).toBe("no-referrer");
    const trailing = await proxy(new NextRequest("https://sasu.test/auth/confirm/?token_hash=abc&type=email"));
    expect(trailing.headers.get("Referrer-Policy")).toBe("no-referrer");
    const callback = await proxy(new NextRequest("https://sasu.test/auth/callback?code=abc"));
    expect(callback.headers.get("Referrer-Policy")).not.toBe("no-referrer");
  });
});

describe("legacy host redirect", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://getsasu.com");
    vi.stubEnv("SASU_LEGACY_HOSTS", "sasu-alpha.vercel.app");
  });
  it("308 redirects a legacy-host page to the canonical origin with no-store", async () => {
    const response = await proxy(new NextRequest("https://sasu-alpha.vercel.app/login?next=%2Fd", { headers: { host: "sasu-alpha.vercel.app" } }));
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("https://getsasu.com/login?next=%2Fd");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("never redirects /api/* on the legacy host", async () => {
    const response = await proxy(new NextRequest("https://sasu-alpha.vercel.app/api/companion/ask", { method: "POST", headers: { host: "sasu-alpha.vercel.app" } }));
    expect(response.status).not.toBe(308);
    expect(response.headers.get("Location")).toBeNull();
  });
  it("redirects a legacy-host page POST with 308 so the method is preserved", async () => {
    const response = await proxy(new NextRequest("https://sasu-alpha.vercel.app/consent", { method: "POST", headers: { host: "sasu-alpha.vercel.app" } }));
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("https://getsasu.com/consent");
  });
  it("leaves other hosts untouched", async () => {
    const response = await proxy(new NextRequest("https://sasu.test/login", { headers: { host: "sasu.test" } }));
    expect(response.status).not.toBe(308);
  });
  it("keeps existing behavior when SASU_LEGACY_HOSTS is unset", async () => {
    vi.stubEnv("SASU_LEGACY_HOSTS", "");
    const response = await proxy(new NextRequest("https://sasu-alpha.vercel.app/login", { headers: { host: "sasu-alpha.vercel.app" } }));
    expect(response.status).not.toBe(308);
  });
});
