import { describe, expect, it } from "vitest";

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
