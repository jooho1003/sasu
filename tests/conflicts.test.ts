import { describe, expect, it } from "vitest";

import { formatConflictBadge } from "@/lib/conflicts";

describe("formatConflictBadge", () => {
  it("KST 날짜 경계에서도 결정일을 M월 D일 형식으로 표시한다", () => {
    expect(formatConflictBadge("2026-03-13T15:30:00.000Z")).toBe(
      "3월 14일 결정과 충돌",
    );
  });

  it("결정일이 없거나 유효하지 않으면 안전한 기본 문구를 쓴다", () => {
    expect(formatConflictBadge(null)).toBe("과거 결정과 충돌");
    expect(formatConflictBadge("not-a-date")).toBe("과거 결정과 충돌");
  });
});
