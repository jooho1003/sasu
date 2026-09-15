import { describe, expect, it } from "vitest";

import {
  adminErrorMessage,
  answerStatsRange,
  inviteUrl,
  normalizeEmail,
} from "@/lib/org-admin";

describe("조직 관리자 순수 유틸리티", () => {
  it("이메일을 정리하고 명백히 잘못된 입력을 거부한다", () => {
    expect(normalizeEmail("  LEAD@Example.COM ")).toBe("lead@example.com");
    for (const value of [null, 123, "", "a", "a@", "@example.com", "a b@example.com"]) {
      expect(normalizeEmail(value)).toBeNull();
    }
  });

  it("기본 최근 14일과 최대 31일 범위를 계산한다", () => {
    expect(answerStatsRange({ today: "2026-09-15" })).toEqual({
      from: "2026-09-02",
      to: "2026-09-15",
    });
    expect(answerStatsRange({ today: "2026-09-15", from: "2026-08-16", to: "2026-09-15" })).toEqual({
      from: "2026-08-16",
      to: "2026-09-15",
    });
  });

  it("잘못된 날짜, 역순, 31일 초과 범위를 거부한다", () => {
    expect(answerStatsRange({ today: "bad" })).toEqual({ error: "invalid_range" });
    expect(answerStatsRange({ today: "2026-09-15", from: "2026-09-16", to: "2026-09-15" })).toEqual({ error: "invalid_range" });
    expect(answerStatsRange({ today: "2026-09-15", from: "2026-08-15", to: "2026-09-15" })).toEqual({ error: "invalid_range" });
  });

  it("초대 URL의 경로 세그먼트를 안전하게 인코딩한다", () => {
    expect(inviteUrl("https://sasu.example/", "a/b c")).toBe("https://sasu.example/invite/a%2Fb%20c");
  });

  it("모든 SQL 오류 코드와 알 수 없는 코드를 한국어로 설명한다", () => {
    const codes = [
      "already_lead", "already_member", "department_name_taken", "department_not_empty",
      "forbidden", "invalid_department_name", "invalid_display_name", "invalid_email",
      "invalid_limit", "invalid_range", "invite_email_mismatch", "invite_expired",
      "invite_limit", "invite_not_found", "invite_not_pending", "invite_pending",
      "invite_revoked", "invite_used", "last_lead", "not_authenticated", "not_lead",
      "not_member", "self_invite_forbidden",
    ];
    for (const code of codes) {
      const message = adminErrorMessage(code);
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toMatch(/감시|위반/);
      expect(message).not.toBe("요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    expect(adminErrorMessage("unknown")).toBe("요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  });
});
