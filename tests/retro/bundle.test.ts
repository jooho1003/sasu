import { describe, expect, it } from "vitest";
import { normalizeActivity, parseRetroBundle } from "@/lib/retro/bundle";
const date = "2026-09-19";
const activity = { kind: "git_commit", ref: "abc", title: "연락 010-1234-5678", text: "name@example.com", at: `${date}T01:00:00Z`, meta: {} };
const bundle = { version: 1, date, tz: "Asia/Seoul", collected_at: `${date}T01:00:00Z`, collector: { name: "sasu-retro-collect", version: "1" }, activities: [activity] };
describe("회고 번들", () => {
  it("구조 검증 후 개인정보를 마스킹한다", () => {
    const result = parseRetroBundle(bundle, new Date(`${date}T02:00:00Z`));
    expect(result.ok).toBe(true);
    expect(normalizeActivity(activity as never).title).toContain("[전화번호]");
    if (result.ok) expect(result.bundle.activities[0].text).toBe("[이메일]");
  });
  it("서버 활동·중복·날짜·시간대·한도를 거부한다", () => {
    const parse = (value: unknown) => parseRetroBundle(value, new Date(`${date}T02:00:00Z`));
    expect(parse({ ...bundle, activities: [{ ...activity, kind: "sasu_decision" }] })).toEqual({ ok: false, code: "server_only_kind" });
    expect(parse({ ...bundle, activities: [activity, activity] })).toEqual({ ok: false, code: "duplicate_ref" });
    expect(parse({ ...bundle, date: "2026-09-01" })).toEqual({ ok: false, code: "date_out_of_range" });
    expect(parse({ ...bundle, tz: "Invalid/Zone" }).ok).toBe(false);
    expect(parse({ ...bundle, activities: [{ ...activity, at: "2026-09-18T01:00:00Z" }] }).ok).toBe(false);
    expect(parse({ ...bundle, activities: [{ ...activity, text: "x".repeat(501) }] }).ok).toBe(false);
    expect(parse({ ...bundle, padding: "x".repeat(1048576) })).toEqual({ ok: false, code: "bundle_too_large" });
  });
});
