import { describe, expect, it } from "vitest";

import { prepareBackfillUpsertItems, sevenDaysAgoUnixSeconds } from "@/lib/pipeline/slack-backfill";

describe("Slack 백필 범위", () => {
  it("기준 시각에서 정확히 7일 전의 Unix timestamp를 만든다", () => {
    expect(
      sevenDaysAgoUnixSeconds(new Date("2026-09-10T12:00:00.000Z")),
    ).toBe("1788436800");
  });

  it("삭제된 동일 소스 항목을 최근 7일 백필에서만 검색 가능 상태로 되돌린다", () => {
    expect(prepareBackfillUpsertItems([{
      source_id: "source-1",
      dept_id: "dept-1",
      external_ref: "123.45",
      author_ext_id: "U1",
      author: "합성 팀원",
      spoken_at: null,
      content: "마스킹된 최근 발언",
    }])).toEqual([{
      source_id: "source-1",
      dept_id: "dept-1",
      external_ref: "123.45",
      author_ext_id: "U1",
      author: "합성 팀원",
      spoken_at: null,
      content: "마스킹된 최근 발언",
      deleted_at: null,
      embedding: null,
      embed_model: null,
      embed_status: "pending",
    }]);
  });
});
