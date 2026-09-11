import { describe, expect, it } from "vitest";

import {
  chunkMeetingItems,
  mergeMeetingSummaries,
  verifyMeetingSummary,
} from "@/lib/pipeline/meeting-summary";

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

  it("splits long meetings into bounded chunks", () => {
    const items = Array.from({ length: 65 }, (_, index) => ({
      id: `item-${index}`,
      content: `발언 ${index}`,
    }));

    expect(chunkMeetingItems(items, 30).map((chunk) => chunk.length)).toEqual([30, 30, 5]);
  });

  it("merges chunk summaries by group and item id", () => {
    expect(
      mergeMeetingSummaries([
        {
          decisions: [{ item_id: "item-1", text: "결정" }],
          deferred: [],
          actions: [{ item_id: "item-2", text: "액션" }],
        },
        {
          decisions: [{ item_id: "item-1", text: "같은 결정" }, { item_id: "item-3", text: "두 번째 결정" }],
          deferred: [{ item_id: "item-4", text: "보류" }],
          actions: [{ item_id: "item-2", text: "같은 액션" }],
        },
      ]),
    ).toEqual({
      decisions: [{ item_id: "item-1", text: "결정" }, { item_id: "item-3", text: "두 번째 결정" }],
      deferred: [{ item_id: "item-4", text: "보류" }],
      actions: [{ item_id: "item-2", text: "액션" }],
    });
  });
});
