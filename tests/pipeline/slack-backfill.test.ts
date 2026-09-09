import { describe, expect, it } from "vitest";

import { sevenDaysAgoUnixSeconds } from "@/lib/pipeline/slack-backfill";

describe("Slack 백필 범위", () => {
  it("기준 시각에서 정확히 7일 전의 Unix timestamp를 만든다", () => {
    expect(
      sevenDaysAgoUnixSeconds(new Date("2026-09-10T12:00:00.000Z")),
    ).toBe("1788436800");
  });
});
