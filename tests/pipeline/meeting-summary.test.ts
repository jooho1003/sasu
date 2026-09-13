import { describe, expect, it } from "vitest";
import { teams, teamClassificationCases } from "@/fixtures/evaluation/team-workflows";

import {
  chunkMeetingItems,
  mergeMeetingSummaries,
  verifyMeetingSummary,
} from "@/lib/pipeline/meeting-summary";

describe("meeting summary evidence", () => {
  for (const team of teams) it(`${team} 회의 미결/실행 인용과 다른 부서 원문 거부`, () => {
    const rows = teamClassificationCases.filter(c => c.team === team);
    const deferred = rows.find(c => c.label === "decision")!;
    const action = rows.find(c => c.label === "action")!;
    const foreign = teamClassificationCases.find(c => c.team !== team)!;
    const result = verifyMeetingSummary({ decisions: [], deferred: [{ item_id: deferred.id, text: deferred.text }], actions: [{ item_id: action.id, text: action.text }, { item_id: foreign.id, text: foreign.text }] }, new Map(rows.map(c => [c.id, c.text])));
    expect(result.valid.deferred).toEqual([{ item_id: deferred.id, text: deferred.text }]);
    expect(result.valid.actions).toEqual([{ item_id: action.id, text: action.text }]);
    expect(result.dropped).toBe(1);
    expect(mergeMeetingSummaries([result.valid, result.valid])).toEqual(result.valid);
  });
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
