import { describe, expect, it } from "vitest";

import {
  AGENT_ROLE_MAX_INPUT_CHARS,
  AGENT_ROLE_SYSTEM_GUARD,
  buildAgentRolePrompt,
  selectAgentRoleChunks,
  verifyAgentRoleEvaluation,
  weightedScore,
} from "@/lib/agent-role";

const role = {
  name: "지원서 검토",
  instruction: "지원자의 업무 경험을 검토합니다.",
  visibility: "leads_only" as const,
  criteria: [
    { key: "experience", label: "경험", description: "관련 업무 경험", weight: 3 },
    { key: "writing", label: "문서", description: "문서 작성", weight: 1 },
  ],
};

const items = new Map([["item-1", "프로젝트를 운영했고 결과를 문서화했습니다."]]);

describe("agent role evidence", () => {
  it("위조 인용과 decision 인용을 근거 없음으로 바꾼다", () => {
    const result = verifyAgentRoleEvaluation({
      criteria: [
        { key: "experience", score: 5, rationale: "근거 있음", citations: [{ item_id: "item-1", decision_id: null, quote: "위조" }] },
        { key: "writing", score: 4, rationale: "근거 있음", citations: [{ item_id: null, decision_id: "decision-1", quote: "문서화" }] },
      ],
      summary: "요약",
    }, role, items);

    expect(result.criteria.map((criterion) => criterion.evidence)).toEqual(["no_evidence", "no_evidence"]);
    expect(result.dropped).toBe(2);
  });

  it("모르는 key와 중복 key를 버리고 누락 기준은 근거 없음으로 채운다", () => {
    const result = verifyAgentRoleEvaluation({
      criteria: [
        { key: "unknown", score: 5, rationale: "무시", citations: [] },
        { key: "experience", score: 5, rationale: "근거 있음", citations: [{ item_id: "item-1", decision_id: null, quote: "프로젝트를 운영" }] },
        { key: "experience", score: 4, rationale: "중복", citations: [{ item_id: "item-1", decision_id: null, quote: "문서화" }] },
      ],
      summary: "요약",
    }, role, items);

    expect(result.criteria.map((criterion) => [criterion.key, criterion.evidence])).toEqual([
      ["experience", "ok"], ["writing", "no_evidence"],
    ]);
    expect(result.dropped).toBe(2);
  });

  it("근거 있는 기준만 가중 평균에 넣고 소수 둘째 자리로 반올림한다", () => {
    const criteria = verifyAgentRoleEvaluation({
      criteria: [
        { key: "experience", score: 4, rationale: "근거", citations: [{ item_id: "item-1", decision_id: null, quote: "프로젝트" }] },
        { key: "writing", score: 5, rationale: "근거", citations: [{ item_id: "item-1", decision_id: null, quote: "문서화" }] },
      ], summary: "요약",
    }, role, items).criteria;
    expect(weightedScore(criteria)).toBe(4.25);
    expect(weightedScore(criteria.map((criterion) => ({ ...criterion, evidence: "no_evidence" as const })))).toBeNull();
  });

  it("고정 가드는 system에 두고 역할 지시문은 마스킹된 user JSON에만 둔다", () => {
    const prompt = buildAgentRolePrompt({ ...role, instruction: "contact@example.com에게 검토를 요청합니다." }, [{ id: "item-1", content: "본문" }]);
    expect(prompt.system).toContain(AGENT_ROLE_SYSTEM_GUARD);
    expect(prompt.system).not.toContain("contact@example.com");
    expect(prompt.user).toContain("[이메일]");
    expect(prompt.user).not.toContain("contact@example.com");
  });

  it("입력 순서대로 24,000자까지만 선택하고 첫 chunk는 잘라 담는다", () => {
    const selected = selectAgentRoleChunks([
      { id: "item-1", content: "가".repeat(AGENT_ROLE_MAX_INPUT_CHARS + 1) },
      { id: "item-2", content: "나" },
    ]);
    expect(selected).toEqual({ items: [{ id: "item-1", content: "가".repeat(AGENT_ROLE_MAX_INPUT_CHARS) }], truncated: true });
  });
});
