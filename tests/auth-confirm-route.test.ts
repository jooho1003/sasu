import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  membershipResult: { data: null as unknown, error: null as unknown },
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createClient,
}));

import { GET as confirm } from "@/app/auth/confirm/route";
import { GET as callback } from "@/app/auth/callback/route";

const TOKEN = `pkce_${"0a1b2c3d".repeat(7)}`;
const USER_ID = "11111111-1111-4111-8111-111111111111";
const DEPT_ID = "22222222-2222-4222-8222-222222222222";
const LOGIN_FAILED = "http://localhost/login?error=auth_callback";

function confirmRequest(query: string, cookie?: string) {
  return new NextRequest(`http://localhost/auth/confirm?${query}`, cookie ? { headers: { cookie } } : undefined);
}

function expectPrivateRedirect(response: Response, location: string) {
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(location);
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("location")).not.toContain(TOKEN);
}

const consoleSpies = () => (["log", "info", "warn", "error", "debug"] as const).map((name) => vi.spyOn(console, name));

describe("/auth/confirm (U5)", () => {
  let spies: ReturnType<typeof consoleSpies>;

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
    vi.stubEnv("SASU_ORG_ADMIN_MODE", "off");
    spies = consoleSpies();
    mocks.membershipResult = { data: { dept_id: DEPT_ID }, error: null };
    mocks.verifyOtp.mockResolvedValue({ data: { user: { id: USER_ID }, session: {} }, error: null });
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.createClient.mockImplementation(async () => ({
      auth: { verifyOtp: mocks.verifyOtp, exchangeCodeForSession: mocks.exchangeCodeForSession, getUser: mocks.getUser },
      rpc: mocks.rpc,
      from: () => {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          order: vi.fn(() => builder),
          limit: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => mocks.membershipResult),
        };
        return builder;
      },
    }));
  });

  afterEach(() => {
    // 일회용 토큰은 어떤 경로에서도 콘솔로 나가지 않는다.
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
      spy.mockRestore();
    }
    vi.unstubAllEnvs();
  });

  it("형식 오류는 세션 클라이언트·verifyOtp 없이 auth_callback으로 보낸다", async () => {
    for (const query of [
      "",
      `token_hash=${TOKEN}`,
      `token_hash=${TOKEN}&type=recovery`,
      `token_hash=${TOKEN}&type=signup`,
      `token_hash=${TOKEN}&type=invite`,
      "token_hash=abc.def&type=email",
      `token_hash=${"x".repeat(513)}&type=email`,
      "type=email",
    ]) {
      const response = await confirm(confirmRequest(query, "sasu_login_next=%2Fadmin"));
      expectPrivateRedirect(response, LOGIN_FAILED);
      expect(response.cookies.get("sasu_login_next")).toBeUndefined();
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("만료·재사용 토큰은 auth_callback으로 보내고 로그인 쿠키를 지우지 않는다", async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { name: "AuthApiError", status: 403, code: "otp_expired", message: "Email link is invalid or has expired" },
    });
    const response = await confirm(confirmRequest(`token_hash=${TOKEN}&type=email`, "sasu_login_next=%2Fadmin"));
    expectPrivateRedirect(response, LOGIN_FAILED);
    expect(response.cookies.get("sasu_login_next")).toBeUndefined();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("성공하면 첫 부서로 302 이동하고 next 쿠키를 지우며 쿼리 next는 무시한다", async () => {
    const response = await confirm(confirmRequest(`token_hash=${TOKEN}&type=email&next=%2Fadmin%2Fevents&redirect_to=https%3A%2F%2Fevil.example`));
    expectPrivateRedirect(response, `http://localhost/d/${DEPT_ID}`);
    expect(mocks.verifyOtp).toHaveBeenCalledExactlyOnceWith({ type: "email", token_hash: TOKEN });
    expect(response.cookies.get("sasu_login_next")?.value).toBe("");
  });

  it("magiclink 타입과 안전한 next 쿠키를 그대로 따른다", async () => {
    const response = await confirm(confirmRequest(`token_hash=${TOKEN}&type=magiclink`, "sasu_login_next=%2Fadmin%2Fevents"));
    expectPrivateRedirect(response, "http://localhost/admin/events");
    expect(mocks.verifyOtp).toHaveBeenCalledExactlyOnceWith({ type: "magiclink", token_hash: TOKEN });
    expect(response.cookies.get("sasu_login_next")?.value).toBe("");
  });

  it("검증 뒤 사용자 조회 실패는 auth_callback, 멤버십 조회 실패는 membership_lookup이며 쿠키를 남긴다", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "jwt" } });
    let response = await confirm(confirmRequest(`token_hash=${TOKEN}&type=email`, "sasu_login_next=%2Fadmin"));
    expectPrivateRedirect(response, LOGIN_FAILED);
    expect(response.cookies.get("sasu_login_next")).toBeUndefined();

    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.membershipResult = { data: null, error: { message: "db down" } };
    response = await confirm(confirmRequest(`token_hash=${TOKEN}&type=email`, "sasu_login_next=%2Fadmin"));
    expectPrivateRedirect(response, "http://localhost/login?error=membership_lookup");
    expect(response.cookies.get("sasu_login_next")).toBeUndefined();
  });
});

describe("/auth/callback 회귀 (U5)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
    vi.stubEnv("SASU_ORG_ADMIN_MODE", "off");
    mocks.membershipResult = { data: { dept_id: DEPT_ID }, error: null };
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.createClient.mockImplementation(async () => ({
      auth: { verifyOtp: mocks.verifyOtp, exchangeCodeForSession: mocks.exchangeCodeForSession, getUser: mocks.getUser },
      rpc: mocks.rpc,
      from: () => {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          order: vi.fn(() => builder),
          limit: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => mocks.membershipResult),
        };
        return builder;
      },
    }));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("code가 없으면 교환 없이 auth_callback으로 보낸다", async () => {
    const response = await callback(new NextRequest("http://localhost/auth/callback"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(LOGIN_FAILED);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("교환 실패는 auth_callback으로 보내고 로그인 쿠키를 지우지 않는다", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { message: "invalid flow state" } });
    const response = await callback(new NextRequest("http://localhost/auth/callback?code=bad", { headers: { cookie: "sasu_login_next=%2Fadmin" } }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(LOGIN_FAILED);
    expect(response.cookies.get("sasu_login_next")).toBeUndefined();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("성공하면 첫 부서로 이동하고 next 쿠키를 지운다", async () => {
    const response = await callback(new NextRequest("http://localhost/auth/callback?code=ok"));
    expect(response.status).toBe(307);
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith("ok");
    expect(response.headers.get("location")).toBe(`http://localhost/d/${DEPT_ID}`);
    expect(response.cookies.get("sasu_login_next")?.value).toBe("");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
});
