import { describe, expect, it } from "vitest";

import {
  orgAdminMode,
  orgAdminReadEnabled,
  orgAdminWritesEnabled,
  trailerPublishEnabled,
  trailerScoresMode,
} from "@/lib/features";

describe("조직 관리자 기능 플래그", () => {
  it("점수표는 정확한 scores/full만 열고 나머지는 off", () => { for(const value of [undefined,"","OFF","FULL","scores","full"]) expect(trailerScoresMode({SASU_TRAILER_SCORES_MODE:value})).toBe(value === "scores" || value === "full" ? value : "off"); });
  it("예고편 발행은 정확한 true 값일 때만 연다", () => {
    for (const value of [undefined, "", "false", "TRUE", "true"]) expect(trailerPublishEnabled({ SASU_TRAILER_PUBLISH_ENABLED: value })).toBe(value === "true");
  });
  it.each([
    [undefined, "off"],
    ["", "off"],
    ["ON", "off"],
    ["read-only", "off"],
    ["unknown", "off"],
    ["readonly", "readonly"],
    ["on", "on"],
  ] as const)("%s 값을 %s로 해석한다", (value, expected) => {
    const env = { SASU_ORG_ADMIN_MODE: value };
    expect(orgAdminMode(env)).toBe(expected);
  });

  it("읽기와 쓰기를 별도로 연다", () => {
    expect(orgAdminReadEnabled({ SASU_ORG_ADMIN_MODE: "readonly" })).toBe(true);
    expect(orgAdminWritesEnabled({ SASU_ORG_ADMIN_MODE: "readonly" })).toBe(false);
    expect(orgAdminReadEnabled({ SASU_ORG_ADMIN_MODE: "on" })).toBe(true);
    expect(orgAdminWritesEnabled({ SASU_ORG_ADMIN_MODE: "on" })).toBe(true);
  });
});
