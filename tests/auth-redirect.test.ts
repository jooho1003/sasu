import { describe, expect, it } from "vitest";

import {
  LOGIN_NEXT_COOKIE,
  loginNextCookieValue,
  resolvePostLoginPath,
  sanitizeInternalPath,
} from "@/lib/auth-redirect";

describe("로그인 후 내부 이동", () => {
  it("안전한 내부 경로만 쿠키에 보관한다", () => {
    expect(LOGIN_NEXT_COOKIE).toBe("sasu_login_next");
    expect(loginNextCookieValue("/admin/members?tab=pending#top")).toBe(
      "/admin/members?tab=pending#top",
    );
    for (const value of [
      null,
      "https://evil.example/path",
      "//evil.example/path",
      "/\\evil.example/path",
      "/login",
      "/login/help",
      "/auth/callback",
    ]) {
      expect(loginNextCookieValue(value)).toBeNull();
    }
  });

  it("기존 내부 경로 정리 동작을 유지한다", () => {
    expect(sanitizeInternalPath("/d/safe?q=1", "/fallback")).toBe("/d/safe?q=1");
    expect(sanitizeInternalPath("//evil.example", "/fallback")).toBe("/fallback");
    expect(sanitizeInternalPath("/%5cevil.example", "/fallback")).toBe("/fallback");
  });

  it("next, 첫 부서, 관리자, 멤버십 없음 순서로 목적지를 정한다", () => {
    const base = { firstDeptId: null, isOrgAdmin: true, adminReadEnabled: true };
    expect(resolvePostLoginPath({ ...base, next: "/admin/events" })).toBe("/admin/events");
    expect(resolvePostLoginPath({ ...base, next: "https://evil.example", firstDeptId: "dept-1" })).toBe("/d/dept-1");
    expect(resolvePostLoginPath({ ...base, next: null, firstDeptId: "dept-1" })).toBe("/d/dept-1");
    expect(resolvePostLoginPath({ ...base, next: null })).toBe("/admin");
    expect(resolvePostLoginPath({ ...base, next: null, adminReadEnabled: false })).toBe("/no-membership");
  });
});
