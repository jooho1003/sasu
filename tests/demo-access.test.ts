import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  cookieGetAll: vi.fn(),
  cookieSet: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: routeMocks.getUser,
      signInWithPassword: routeMocks.signInWithPassword,
      signOut: routeMocks.signOut,
    },
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: routeMocks.cookieGetAll, set: routeMocks.cookieSet }),
}));

import { GET as demoAccess } from "@/app/demo/access/route";
import {
  DEMO_DEFAULT_DEPT_ID,
  DEMO_FEATURES,
  DEMO_REVIEWER_ID,
  demoAutoLoginEnabled,
  demoReviewerEmail,
  isDemoReviewer,
  safeDemoDestination,
} from "@/lib/demo-access";

describe("심사위원 데모 자동 접근", () => {
  it("정확한 true 플래그에서만 자동 로그인을 연다", () => {
    for (const value of [undefined, "", "false", "TRUE", "true"]) {
      expect(demoAutoLoginEnabled({ SASU_DEMO_AUTO_LOGIN_ENABLED: value })).toBe(
        value === "true",
      );
    }
  });

  it("서버 설정 이메일을 정규화하고 비어 있으면 합성 기본값을 쓴다", () => {
    expect(demoReviewerEmail({})).toBe("judge-demo@demo.sasu.team");
    expect(
      demoReviewerEmail({ SASU_DEMO_USER_EMAIL: "  Judge@Example.COM  " }),
    ).toBe("judge@example.com");
  });

  it("고정된 합성 계정만 심사위원 계정으로 판정한다", () => {
    expect(isDemoReviewer(DEMO_REVIEWER_ID)).toBe(true);
    expect(isDemoReviewer(null)).toBe(false);
    expect(isDemoReviewer("11111111-1111-4111-8111-111111111111")).toBe(false);
  });

  it("데모 하위 화면만 로그인 후 이동 대상으로 허용한다", () => {
    expect(safeDemoDestination(`/demo/d/${DEMO_DEFAULT_DEPT_ID}/ask?q=principle`)).toBe(
      `/demo/d/${DEMO_DEFAULT_DEPT_ID}/ask?q=principle`,
    );
    expect(safeDemoDestination("/demo/admin?view=members")).toBe(
      "/demo/admin?view=members",
    );
    for (const unsafe of [
      "https://attacker.example/demo",
      "//attacker.example/demo",
      "/api/jobs/run",
      `/d/${DEMO_DEFAULT_DEPT_ID}`,
      "/demo/access",
      "/demo/d/not-a-demo-department",
      "javascript:alert(1)",
    ]) {
      expect(safeDemoDestination(unsafe)).toBe("/demo");
    }
  });

  it("심사 동선에 전체 핵심 기능을 중복 없이 제공한다", () => {
    const keys = DEMO_FEATURES.map((feature) => feature.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(
      expect.arrayContaining([
        "dashboard",
        "card",
        "ledger",
        "ask",
        "reviews",
        "documents",
        "roles",
        "retention",
        "settings",
        "admin",
        "trailers",
      ]),
    );
    expect(DEMO_FEATURES.every((feature) => feature.href.startsWith("/demo"))).toBe(
      true,
    );
  });
});

// U2 (phase 50, ADR-089): 심사 계정 확인 실패 정리는 현재 브라우저 세션만 끝낸다.
describe("GET /demo/access 실패 정리 (U2)", () => {
  const OTHER_USER_ID = "11111111-1111-4111-8111-111111111111";

  function accessRequest() {
    return new NextRequest("http://localhost/demo/access");
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("SASU_DEMO_AUTO_LOGIN_ENABLED", "true");
    vi.stubEnv("SASU_DEMO_USER_PASSWORD", "test-only-password");
    routeMocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    routeMocks.signOut.mockResolvedValue({ error: null });
    routeMocks.cookieGetAll.mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("다른 계정으로 로그인되면 scope local로 1회 정리하고 unavailable로 보낸다", async () => {
    routeMocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: OTHER_USER_ID }, session: { expires_in: 3_600 } },
      error: null,
    });
    const response = await demoAccess(accessRequest());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/demo?demo=unavailable");
    expect(routeMocks.signOut).toHaveBeenCalledTimes(1);
    expect(routeMocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("오류와 함께 세션이 생기면 scope local로 정리한다", async () => {
    routeMocks.signInWithPassword.mockResolvedValue({
      data: { user: null, session: { expires_in: 3_600 } },
      error: { message: "x" },
    });
    const response = await demoAccess(accessRequest());
    expect(response.headers.get("location")).toBe("http://localhost/demo?demo=unavailable");
    expect(routeMocks.signOut).toHaveBeenCalledTimes(1);
    expect(routeMocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("세션 없이 실패하면 signOut을 부르지 않는다", async () => {
    routeMocks.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "x" },
    });
    const response = await demoAccess(accessRequest());
    expect(response.headers.get("location")).toBe("http://localhost/demo?demo=unavailable");
    expect(routeMocks.signOut).not.toHaveBeenCalled();
  });

  it("심사 계정 로그인 성공은 signOut 없이 데모로 보낸다", async () => {
    routeMocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: DEMO_REVIEWER_ID }, session: { expires_in: 3_600 } },
      error: null,
    });
    const response = await demoAccess(accessRequest());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/demo");
    expect(routeMocks.signOut).not.toHaveBeenCalled();
  });
});
