import { describe, expect, it } from "vitest";
import { parseSlackChange } from "@/lib/slack/change";

describe("Slack 원문 변경 정규화", () => {
  const edited = { type: "message", subtype: "message_changed", channel: "C123", event_ts: "1726123457.000003", message: { user: "U123", ts: "1726123456.000001", text: "연락은 qa@example.com", edited: { ts: "1726123457.000002" } } };
  it("중첩 메시지의 작성자·원본 timestamp와 수정 시각을 구분한다", () => {
    expect(parseSlackChange(edited)).toEqual({ kind: "edit", channel: "C123", externalRef: "1726123456.000001", changedAt: "1726123457.000002", authorId: "U123", content: expect.not.stringContaining("qa@example.com") });
  });
  it("삭제는 previous_message 본문이나 작성자가 없어도 원본 식별자만 사용한다", () => {
    expect(parseSlackChange({ type: "message", subtype: "message_deleted", channel: "C123", deleted_ts: "1726123456.000001", event_ts: "1726123457.000003", previous_message: { text: "절대 저장하지 않을 본문" } })).toEqual({ kind: "delete", channel: "C123", externalRef: "1726123456.000001", changedAt: "1726123457.000003", authorId: null, content: null });
  });
  it("빈 본문으로 수정한 이벤트도 이전 본문을 제거할 수 있다", () => {
    expect(parseSlackChange({ ...edited, message: { ...edited.message, text: "" } })?.content).toBe("");
  });
  it.each([null, {}, { ...edited, channel_type: "im" }, { ...edited, channel: "D123" }, { ...edited, message: { ...edited.message, bot_id: "B123" } }, { ...edited, message: { ...edited.message, ts: "invalid" } }, { ...edited, message: { ...edited.message, user: null } }])("지원하지 않거나 잘못된 이벤트는 원문 없이 버린다", event => {
    expect(parseSlackChange(event)).toBeNull();
  });
});
