import { describe, expect, it } from "vitest";

import { DEMO_DEPARTMENTS } from "../scripts/seed-demo";

describe("게스트 데모 시드", () => {
  it("디자인팀은 인용 가능한 합성 데이터와 권한 차등을 갖는다", () => {
    const design = DEMO_DEPARTMENTS.find((department) => department.name === "디자인팀 사수");

    expect(design).toBeDefined();
    expect(design?.id).toMatch(/^eeeeeeee-/);
    expect(design?.sources.filter((source) => source.kind === "slack_channel" && source.visibility === "dept")).toHaveLength(1);
    expect(design?.sources.filter((source) => source.kind === "meeting")).toHaveLength(1);
    expect(design?.sources.filter((source) => source.is_principles)).toHaveLength(1);
    expect(design?.sources.filter((source) => source.visibility === "leads_only")).toHaveLength(1);
    expect(design?.items).toHaveLength(24);
    expect([design?.request, ...(design?.extraRequests ?? [])]).toHaveLength(2);
    expect([design?.priorDecision, ...(design?.extraPriorDecisions ?? [])]).toHaveLength(3);

    for (const request of [design?.request, ...(design?.extraRequests ?? [])]) {
      for (const itemId of request?.citation_item_ids ?? []) {
        expect(design?.items.find((item) => item.id === itemId)).toBeDefined();
      }
    }
  });

  it("모든 준비된 답변과 카드 인용은 같은 팀 원문에 포함된다", () => {
    for (const department of DEMO_DEPARTMENTS) {
      for (const request of [department.request, ...(department.extraRequests ?? [])]) {
        for (const itemId of request.citation_item_ids) {
          expect(department.items.find((item) => item.id === itemId)?.content).toBeTruthy();
        }
      }
      for (const answer of department.answers) {
        expect(department.items.find((item) => item.id === answer.item_id)?.content).toBeTruthy();
      }
    }
  });
});
