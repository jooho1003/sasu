import { describe, expect, it } from "vitest";

import { weightedScore } from "../lib/agent-role";
import { MASK_PATTERNS } from "../lib/mask";
import { DEMO_AGENT_ROLE, DEMO_DEPARTMENTS } from "../scripts/seed-demo";

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

  it("개발팀 역할 점수표는 각 지원서 원문 인용과 코드 계산 점수를 갖는다", () => {
    const development = DEMO_DEPARTMENTS.find((department) => department.id === DEMO_AGENT_ROLE.dept_id);

    expect(development).toBeDefined();
    expect(DEMO_AGENT_ROLE.visibility).toBe("dept");
    expect(DEMO_AGENT_ROLE.results).toHaveLength(3);

    for (const result of DEMO_AGENT_ROLE.results) {
      const sourceItems = development?.items.filter((item) => item.source_id === result.source_id) ?? [];
      for (const criterion of result.result.criteria) {
        if (criterion.evidence === "no_evidence") {
          expect(criterion.score).toBeNull();
          expect(criterion.citations).toEqual([]);
          continue;
        }
        expect(criterion.citations.length).toBeGreaterThan(0);
        for (const citation of criterion.citations) {
          expect(sourceItems.find((item) => item.id === citation.item_id)?.content).toContain(citation.quote);
        }
      }
      expect(result.weighted_score).toBe(weightedScore(result.result.criteria));
    }
    expect(DEMO_AGENT_ROLE.results.map((result) => result.weighted_score)).toEqual([5, 1.67, 0.67]);
    expect(DEMO_AGENT_ROLE.results.map((result) => result.weighted_score)).toEqual(
      [...DEMO_AGENT_ROLE.results].sort((left, right) => (right.weighted_score ?? 0) - (left.weighted_score ?? 0)).map((result) => result.weighted_score),
    );
  });

  it("지원서 결과에는 합불 판정이 없고 합성 시드에는 마스킹 대상 문자열이 없다", () => {
    const forbiddenKeys = ["pass", "fail", "hire", "recommend"];
    const serializedResults = JSON.stringify(DEMO_AGENT_ROLE.results).toLowerCase();
    for (const key of forbiddenKeys) expect(serializedResults).not.toContain(`\"${key}\"`);

    const development = DEMO_DEPARTMENTS.find((department) => department.id === DEMO_AGENT_ROLE.dept_id);
    const serializedSeed = JSON.stringify({ development, role: DEMO_AGENT_ROLE });
    for (const { re } of MASK_PATTERNS) {
      const flags = re.flags.replace("g", "");
      expect(new RegExp(re.source, flags).test(serializedSeed)).toBe(false);
    }
  });
});
