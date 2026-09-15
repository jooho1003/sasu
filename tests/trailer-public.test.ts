import { describe, expect, it } from "vitest";
import fixture from "./fixtures/trailer-approval.json";
import { parsePublicTrailer, PUBLIC_TRAILER_SLUG } from "@/lib/trailer-public";
describe("공개 예고편 payload", () => {
  it("1~3개 사례와 https 주소만 통과", () => { expect(parsePublicTrailer({ scenarios: fixture.scenarios, apply_url: "https://example.com/jobs" })).toMatchObject({ status: "ok", applyUrl: "https://example.com/jobs" }); expect(parsePublicTrailer({ scenarios: fixture.scenarios.slice(0, 1), apply_url: null }).status).toBe("ok"); });
  it.each([null, {}, { scenarios: [], apply_url: null }, { scenarios: fixture.scenarios, apply_url: "http://example.com" }, { scenarios: fixture.scenarios, apply_url: null, source_decision_ids: [] }, { scenarios: [fixture.scenarios[0], fixture.scenarios[0]], apply_url: null }])("비공개 필드·중복·오류는 fail closed", (data) => { expect(parsePublicTrailer(data)).toEqual({ status: "invalid" }); });
  it("인용 원문 불일치를 거절", () => { const scenarios = structuredClone(fixture.scenarios); scenarios[0].ending.quote = "존재하지 않는 문장"; expect(parsePublicTrailer({ scenarios, apply_url: null }).status).toBe("invalid"); });
  it("공개 slug는 소문자와 숫자 22자리", () => { expect(PUBLIC_TRAILER_SLUG.test("abcdefghijklmnopqrstuv")).toBe(true); for (const invalid of ["A".repeat(22), "a".repeat(21), "a".repeat(23), "a/".repeat(11)]) expect(PUBLIC_TRAILER_SLUG.test(invalid)).toBe(false); });
});
