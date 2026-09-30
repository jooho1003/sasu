import { describe, expect, it } from "vitest";
import {
  formatExpiry, missingStartConditions, missingTestConditions, recorderErrorText,
  recorderStage, recorderTabTitle, sessionStateLabel, signalDetected, stopReasonNotice,
} from "@/lib/recording/recorder-copy";

describe("recorder copy", () => {
  it.each([
    ["shared_audio_missing", "공유", "오디오 공유"],
    ["microphone_missing", "마이크", "권한"],
    ["input_ended", "끊", "다시 선택"],
    ["storage_space_insufficient", "저장 공간", "64MB"],
    ["recording_storage_unavailable", "저장소", "일반 창"],
    ["recording_worker_timeout", "준비", "새로 고침"],
    ["recording_other_tab", "다른 탭", "마친 뒤"],
    ["recording_key_forbidden", "권한", "동의"],
    ["recording_unavailable", "열 수 없", "목록"],
    ["recording_key_unavailable", "키", "다시"],
    ["recording_recovery_changed", "기록", "목록"],
    ["recording_levels_invalid", "소리", "다시 저장"],
    ["recording_bundle_invalid", "구간", "다시 내려받"],
  ])("translates %s without leaking the code", (code, cause, action) => {
    const value = recorderErrorText(new Error(code));
    expect(value).toContain(cause);
    expect(value).toContain(action);
    expect(value).not.toContain(code);
    expect(/[가-힣]/.test(value)).toBe(true);
  });

  it("preserves Korean server messages and explains browser errors", () => {
    expect(recorderErrorText("녹음 권한을 확인해 주세요.")).toBe("녹음 권한을 확인해 주세요.");
    expect(recorderErrorText(new DOMException("", "NotAllowedError"))).toContain("허용");
    expect(recorderErrorText(new Error("Permission denied by system"))).toContain("허용");
    expect(recorderErrorText(new TypeError("Failed to fetch"))).toContain("인터넷 연결");
    expect(recorderErrorText(new Error("some_unknown_code"))).toBe("녹음 작업을 완료하지 못했습니다. 다시 시도해 주세요.");
    expect(recorderErrorText(null)).toBe("녹음 작업을 완료하지 못했습니다. 다시 시도해 주세요.");
  });

  it.each([
    "duration_limit", "page_left", "input_ended", "capture_suspended", "capture_input_stalled",
    "capture_backlog", "storage_backlog", "storage_failed", "capture_worker_timeout",
    "capture_worker_failed", "capture_processor_failed", "capture_lease_lost",
    "profile_storage_failed", "recording_setup_failed", "unknown_reason",
  ])("explains stop reason %s", (reason) => {
    const notice = stopReasonNotice(reason);
    expect(/[가-힣]/.test(notice.text)).toBe(true);
    expect(notice.text).not.toContain(reason);
    expect(notice.tone).toBe(reason === "duration_limit" ? "info" : "warning");
  });

  it("labels every session state", () => {
    expect(["active", "saving", "completed", "discarded", "expired", "revoked", "other"].map(sessionStateLabel))
      .toEqual(["저장 전", "서버에서 확인 중", "저장 완료", "폐기됨", "기한 만료", "참석자 동의 변경으로 취소됨", "확인 필요"]);
  });

  it("resolves stages with server state taking precedence", () => {
    const base = { selected: false, starting: false, snapshotState: null, sessionState: null } as const;
    expect(recorderStage(base)).toBe("setup");
    expect(recorderStage({ ...base, starting: true })).toBe("starting");
    expect(recorderStage({ ...base, selected: true })).toBe("stopped");
    for (const state of ["recording", "stopping"] as const)
      expect(recorderStage({ ...base, selected: true, snapshotState: state })).toBe("recording");
    expect(recorderStage({ ...base, selected: true, snapshotState: "paused" })).toBe("paused");
    expect(recorderStage({ ...base, selected: true, snapshotState: "interrupted" })).toBe("stopped");
    expect(recorderStage({ ...base, selected: true, snapshotState: "stopped" })).toBe("stopped");
    expect(recorderStage({ ...base, selected: true, snapshotState: "recording", sessionState: "saving" })).toBe("saving");
    expect(recorderStage({ ...base, selected: true, snapshotState: "recording", sessionState: "completed" })).toBe("done");
  });

  it("lists missing start conditions in screen order", () => {
    expect(missingTestConditions({ consent: false, supported: false })).toHaveLength(2);
    expect(missingTestConditions({ consent: true, supported: true })).toEqual([]);
    const missing = missingStartConditions({ consent: false, heardTest: false, title: "  ", supported: false, secure: false });
    expect(missing).toHaveLength(5);
    expect(missing[0]).toContain("제목");
    expect(missing[1]).toContain("동의");
    expect(missing[2]).toContain("5초");
    expect(missing[3]).toContain("크롬");
    expect(missing[4]).toContain("보안");
    expect(missingStartConditions({ consent: true, heardTest: true, title: "회의", supported: true, secure: true })).toEqual([]);
  });

  it("detects recent sound at the boundary", () => {
    expect(signalDetected([])).toBe(false);
    expect(signalDetected([0.0019, 0])).toBe(false);
    expect(signalDetected([0, 0.002])).toBe(true);
    expect(signalDetected([0.004], 0.005)).toBe(false);
  });

  it("formats expiry in Seoul as today, tomorrow, or date", () => {
    const now = new Date("2026-09-29T12:00:00+09:00");
    expect(formatExpiry("2026-09-29T21:53:00+09:00", now)).toBe("오늘 오후 9:53까지");
    expect(formatExpiry("2026-09-30T08:10:00+09:00", now)).toBe("내일 오전 8:10까지");
    expect(formatExpiry("2026-10-01T13:00:00+09:00", now)).toBe("10월 1일 오후 1:00까지");
  });

  it("formats active tab titles without changing other stages", () => {
    expect(recorderTabTitle("recording", 593, "사수")).toBe("● 녹음 중 9:53 · 사수");
    expect(recorderTabTitle("paused", 10, "사수")).toBe("❚❚ 잠시 멈춤 0:10 · 사수");
    expect(recorderTabTitle("interrupted", 10, "사수")).toBe("⚠ 녹음 중단 · 사수");
    expect(recorderTabTitle("done", 10, "사수")).toBe("사수");
  });
});
