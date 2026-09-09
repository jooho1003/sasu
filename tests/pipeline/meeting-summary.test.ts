import { describe, expect, it } from "vitest";

import { verifyMeetingSummary } from "@/lib/pipeline/meeting-summary";

describe("meeting summary evidence", () => {
  it("keeps only summary lines that are included in meeting items", () => {
    const result = verifyMeetingSummary({
      decisions: [{ item_id: "item-1", text: "배포는 금요일에 진행합니다." }, { item_id: "item-2", text: "없는 원문" }],
      deferred: [],
      actions: [],
    }, new Map([["item-1", "배포는 금요일에 진행합니다. 롤백 플랜을 확인합니다."]]));
    expect(result.valid).toEqual({ decisions: [{ item_id: "item-1", text: "배포는 금요일에 진행합니다." }], deferred: [], actions: [] });
    expect(result.dropped).toBe(1);
  });
});
