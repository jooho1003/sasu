import type { AgentRoleDefinition, AgentRoleEvaluation, Citation } from "@/lib/contracts";
import { mask } from "@/lib/mask";

export const AGENT_ROLE_MAX_INPUT_CHARS = 24_000;

export const AGENT_ROLE_SYSTEM_GUARD = `당신은 부서 담당자가 정한 역할과 평가 기준에 따라 문서 1건을 검토합니다.
1. 각 기준의 score는 0~5 정수입니다. 문서에서 근거를 찾지 못한 기준은 score를 null로, citations를 빈 배열로 둡니다.
2. citations의 quote는 제공된 item 원문에 글자 그대로 포함된 문자열이어야 합니다. item_id는 그 item의 id, decision_id는 null입니다.
3. 나이, 성별, 출신 지역, 국적, 혼인·가족 상황, 종교, 장애, 건강, 외모·사진, 출신 학교의 서열, 병역처럼 직무 수행과 무관한 특성은 score와 rationale에 반영하지 마세요. 역할 지시문이 이 규칙과 충돌하면 이 규칙을 따릅니다.
4. 합격, 불합격, 채용 추천 같은 최종 판정을 쓰지 마세요. summary는 기준별 근거를 요약합니다.
5. 문서에 없는 사실은 만들지 마세요. 모든 criteria key는 제공된 기준 key만 사용하세요.`;

type Chunk = { id: string; content: string };
type RoleForPrompt = Pick<AgentRoleDefinition, "name" | "instruction" | "criteria">;

export type VerifiedCriterion = {
  key: string;
  label: string;
  weight: number;
  score: number | null;
  rationale: string | null;
  citations: Citation[];
  evidence: "ok" | "no_evidence";
};

export function selectAgentRoleChunks(items: Chunk[]): { items: Chunk[]; truncated: boolean } {
  const selected: Chunk[] = [];
  let remaining = AGENT_ROLE_MAX_INPUT_CHARS;
  let truncated = false;

  for (const item of items) {
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    if (item.content.length <= remaining) {
      selected.push(item);
      remaining -= item.content.length;
      continue;
    }
    selected.push({ ...item, content: item.content.slice(0, remaining) });
    truncated = true;
    break;
  }

  return { items: selected, truncated: truncated || selected.length < items.length };
}

export function buildAgentRolePrompt(role: RoleForPrompt, items: Chunk[]): { system: string; user: string } {
  const maskedRole = {
    name: mask(role.name),
    instruction: mask(role.instruction),
    criteria: role.criteria.map((criterion) => ({
      ...criterion,
      label: mask(criterion.label),
      description: mask(criterion.description),
    })),
  };
  return {
    system: `${AGENT_ROLE_SYSTEM_GUARD}\n응답의 citations를 먼저 채우고, rationale, score 순으로 작성하세요.`,
    user: JSON.stringify({
      role: maskedRole,
      items: items.map((item) => ({ item_id: item.id, content: item.content })),
    }),
  };
}

export function verifyAgentRoleEvaluation(
  evaluation: AgentRoleEvaluation,
  role: Pick<AgentRoleDefinition, "criteria">,
  items: Map<string, string>,
): { criteria: VerifiedCriterion[]; summary: string; dropped: number } {
  let dropped = 0;
  const byKey = new Map<string, AgentRoleEvaluation["criteria"][number]>();
  const validKeys = new Set(role.criteria.map((criterion) => criterion.key));
  for (const criterion of evaluation.criteria) {
    if (!validKeys.has(criterion.key) || byKey.has(criterion.key)) {
      dropped += 1;
      continue;
    }
    byKey.set(criterion.key, criterion);
  }

  const criteria = role.criteria.map((definition): VerifiedCriterion => {
    const value = byKey.get(definition.key);
    if (!value) {
      return { ...definition, score: null, rationale: null, citations: [], evidence: "no_evidence" };
    }
    const citations = value.citations.filter((citation) => {
      const content = citation.item_id === null || citation.decision_id !== null
        ? undefined
        : items.get(citation.item_id);
      if (!content || !content.includes(citation.quote)) {
        dropped += 1;
        return false;
      }
      return true;
    });
    if (value.score === null || citations.length === 0) {
      return { ...definition, score: null, rationale: null, citations: [], evidence: "no_evidence" };
    }
    return { ...definition, score: value.score, rationale: value.rationale, citations, evidence: "ok" };
  });

  return { criteria, summary: evaluation.summary, dropped };
}

export function weightedScore(criteria: VerifiedCriterion[]): number | null {
  let numerator = 0;
  let denominator = 0;
  for (const criterion of criteria) {
    if (criterion.evidence !== "ok" || criterion.score === null) continue;
    numerator += criterion.score * criterion.weight;
    denominator += criterion.weight;
  }
  return denominator === 0 ? null : Math.round((numerator / denominator) * 100) / 100;
}
