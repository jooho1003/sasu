import { describe, expect, it } from "vitest";

import { TrailerInviteIssued, type TrailerInviteRow } from "@/lib/contracts";
import { trailerPublishEnabled, trailerInvitesEnabled } from "@/lib/features";
import {
  TRAILER_INVITE_CONSENT_VERSION,
  inviteErrorCode,
  inviteStatusLabel,
  maskInviteEmail,
  normalizeInviteEmails,
  parseTrailerInviteOpen,
  parseTrailerInviteRows,
} from "@/lib/trailer-invite";

const scenario = {
  id: "quote-policy",
  title: "견적 검토",
  summary: "협력사 견적을 검토합니다.",
  facts: [{ id: "fact-budget", place: "finance", label: "예산", text: "예산 상한은 100만원입니다. 예산을 먼저 확인하세요." }],
  dialogues: [{ id: "dialogue-lead", place: "finance", question: "예산을 확인했나요?", fact_id: "fact-budget", quote: "예산을 먼저 확인하세요." }],
  choices: [{ id: "choice-review", label: "재검토" }, { id: "choice-approve", label: "승인" }],
  ending: { choice_id: "choice-review", fact_id: "fact-budget", quote: "예산 상한은 100만원입니다." },
};

const openResponse = {
  scenarios: [scenario],
  apply_url: "https://jobs.example.com/role",
  org_display_name: "사수 주식회사",
  state: "consent_required",
  consent_version: "2026-09-18.1",
  expires_at: "2026-09-25T00:00:00.000Z",
};

const row: TrailerInviteRow = {
  invite_id: "a1d14940-5d91-4a73-8c44-fcae8e1fecec",
  email: "candidate@example.com",
  status: "pending",
  expires_at: "2026-09-25T00:00:00.000Z",
  first_opened_at: null,
  consented_at: null,
  submitted_at: null,
  attempt_id: null,
  attempt_status: null,
  weighted_score: null,
};

describe("지원자 링크 순수 계약", () => {
  it("발행·초대 플래그는 정확한 true와 발행 활성화를 함께 요구한다", () => {
    expect(trailerPublishEnabled({ SASU_TRAILER_PUBLISH_ENABLED: "true" })).toBe(true);
    expect(trailerInvitesEnabled({ SASU_TRAILER_PUBLISH_ENABLED: "true", SASU_TRAILER_INVITES_ENABLED: "true" })).toBe(true);
    expect(trailerInvitesEnabled({ SASU_TRAILER_PUBLISH_ENABLED: "false", SASU_TRAILER_INVITES_ENABLED: "true" })).toBe(false);
  });

  it("이메일을 정규화·중복 제거하고 21개는 명확히 거부한다", () => {
    expect(normalizeInviteEmails(" A@Example.com, b@example.com\nA@example.com  invalid ")).toEqual({
      emails: ["a@example.com", "b@example.com"], invalid: ["invalid"],
    });
    expect(() => normalizeInviteEmails(Array.from({ length: 21 }, (_, index) => `user${index}@example.com`).join("\n"))).toThrow("invite_batch_too_large");
  });

  it("이메일 마스킹은 기존 초대 미리보기 규칙과 같은 앞 두 글자 형식이다", () => {
    expect(maskInviteEmail("abigail@example.com")).toBe("ab***@example.com");
    expect(maskInviteEmail("a@example.com")).toBe("a***@example.com");
  });

  it("공개 열람 응답은 엄격한 시나리오 계약만 통과시킨다", () => {
    expect(parseTrailerInviteOpen(openResponse)).toMatchObject({ state: "consent_required", scenarios: [scenario] });
    expect(parseTrailerInviteOpen({ ...openResponse, dept_id: "leak" })).toBeNull();
    expect(parseTrailerInviteOpen({ ...openResponse, org_id: "leak" })).toBeNull();
    expect(parseTrailerInviteOpen({ ...openResponse, trailer_id: "leak" })).toBeNull();
    expect(parseTrailerInviteOpen({ ...openResponse, scenarios: [{ ...scenario, facts: [] }] })).toBeNull();
  });

  it("목록 응답은 한 행이라도 깨지면 전체를 거부한다", () => {
    expect(parseTrailerInviteRows([row])).toEqual([row]);
    expect(() => parseTrailerInviteRows([row, { ...row, status: "unknown" }])).toThrow();
  });

  it("재채점 대상은 초대 ID가 아닌 채점 attempt ID로 구분한다", () => {
    expect(parseTrailerInviteRows([{ ...row, attempt_id: "b1d14940-5d91-4a73-8c44-fcae8e1fecec", attempt_status: "failed" }])[0].attempt_id).toBe("b1d14940-5d91-4a73-8c44-fcae8e1fecec");
  });

  it("모든 상태 라벨은 선발·순위 표현을 포함하지 않는다", () => {
    const forbidden = ["합격", "불합격", "탈락", "추천", "순위"];
    const statuses: TrailerInviteRow["status"][] = ["pending", "opened", "consented", "submitted", "scored", "expired", "revoked", "withdrawn", "purged"];
    for (const status of statuses) {
      const label = inviteStatusLabel(status);
      expect(label.length).toBeGreaterThan(0);
      expect(forbidden.some((word) => label.includes(word))).toBe(false);
    }
  });

  it("오류 코드는 원문 오류 메시지를 외부로 내보내지 않는다", () => {
    expect(TRAILER_INVITE_CONSENT_VERSION).toBe("1");
    expect(inviteErrorCode({ code: "P0001", message: "consent_required" })).toBe("consent_required");
    expect(inviteErrorCode({ code: "22023", message: "invalid_attempt" })).toBe("invalid_attempt");
    expect(inviteErrorCode(new Error("very secret email@example.com"))).toBe("unknown");
  });
});

it("PostgREST 시각 오프셋으로 발급·목록·열람 계약을 읽는다", () => {
 const expires_at="2026-09-25T00:00:00.000000+00:00";
 expect(TrailerInviteIssued.safeParse({invite_id:row.invite_id,email:row.email,token:"a".repeat(64),expires_at,skipped_reason:null}).success).toBe(true);
 expect(parseTrailerInviteOpen({...openResponse,expires_at})).not.toBeNull();
 expect(parseTrailerInviteRows([{...row,expires_at}])).toHaveLength(1);
});
