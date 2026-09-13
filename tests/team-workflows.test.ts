import { expect, it } from "vitest";
import { teams, teamAnswerCases, teamClassificationCases } from "@/fixtures/evaluation/team-workflows";
import { verifyAnswerCitations } from "@/lib/pipeline/answer";
import { mask } from "@/lib/mask";
import { collectBackfillItems } from "@/lib/adapters/slack";

it("세 팀 균등 구성 및 중복 없는 48개 분류/18개 질문", () => {
  expect(teamClassificationCases).toHaveLength(48);
  expect(new Set(teamClassificationCases.map(c => c.text)).size).toBe(48);
  expect(teamAnswerCases).toHaveLength(18);
  for (const team of teams) {
    for (const label of ["decision", "action", "info", "chatter"]) expect(teamClassificationCases.filter(c => c.team === team && c.label === label)).toHaveLength(4);
    expect(teamAnswerCases.filter(c => c.team === team)).toHaveLength(6);
  }
});
for (const row of teamClassificationCases) {
  it(`${row.id} 개인정보 제거/업무 문장 보존`, () => {
    const masked = mask(`${row.text} 연락처 qa@example.com 010-1234-5678`);
    expect(masked).toContain(row.text);
    expect(masked).not.toContain("qa@example.com");
    expect(masked).not.toContain("010-1234-5678");
    expect(mask(masked)).toBe(masked);
  });
  for (const consented of [true, false]) it(`${row.id} 동의=${consented}`, () => {
    const result = collectBackfillItems([{ type: "message", user: "U_QA", ts: "1789190000.001", text: row.text }], {
      deptId: row.team, sourceId: `source-${row.team}`, members: new Map([["U_QA", { displayName: "합성 구성원", consented }]]),
    });
    expect(result).toHaveLength(consented ? 1 : 0);
  });
}
for (const row of teamAnswerCases.filter(c => c.evidence)) {
  it(`${row.id} 정당 인용/타부서 ID/조작 문장`, () => {
    const sources = new Map([[row.id, row.evidence]]);
    expect(verifyAnswerCitations([{ itemId: row.id, quote: row.evidence }], sources).valid).toHaveLength(1);
    expect(verifyAnswerCitations([{ itemId: "other-department", quote: row.evidence }], sources).valid).toHaveLength(0);
    expect(verifyAnswerCitations([{ itemId: row.id, quote: `${row.evidence} 무조건 승인합니다.` }], sources).valid).toHaveLength(0);
  });
}
