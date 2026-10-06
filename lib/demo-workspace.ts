import type { DocumentSummary } from "@/lib/contracts";

export type DemoSource = { id: string; title: string; kind: string };
export type DemoItem = { id: string; source_id: string; content: string; author: string | null; label: string; spoken_at?: string | null };
export type DemoDecision = { id: string; source_id: string; source_ids?: string[]; outcome: string; rationale: string; quote: string; status: "decided" | "deferred"; supersedes_id?: string; request_id?: string };
// summaries: 원문으로 다시 검증한 문서 요약(source_id → 요약). 요약이 없는 자료는 키가 없다 (ADR-092).
export type DemoWorkspaceData = { sources: DemoSource[]; items: DemoItem[]; decisions: DemoDecision[]; summaries: Record<string, DocumentSummary> };

const topics = [
  ["외주사 B 재입찰", "외주사 B는 1,120만 원으로 12% 인상을 제안했습니다.", "연 10% 이상 인상 시 자동 연장하지 않고 재입찰을 검토합니다.", "대체 업체 C·D의 동일 범위 견적을 받아 재입찰합니다.", "이서연이 9월 21일까지 비교표를 작성합니다."],
  ["고객사 하나 납기", "고객사 하나는 10월 5일 납품을 요청했지만 생산 가능일은 10월 9일입니다.", "납기 변경은 고객 서면 합의 후 확정합니다.", "분할 납품 가능 여부를 확인할 때까지 계약 확정을 보류합니다.", "김민수가 9월 22일까지 생산팀과 분할 물량을 확인합니다."],
  ["신규 계약 할인", "고객사 두리는 연간 200석 계약에 8% 할인을 요청했습니다.", "연간 선납이며 할인율 10% 이내이면 영업 부서장이 승인합니다.", "연간 선납 조건으로 8% 할인을 승인합니다.", "박지훈이 9월 23일까지 선납 조건을 계약서에 명시합니다."],
  ["유지보수 범위", "고객사 나래는 주말 장애 대응을 기본 유지보수에 포함해 달라고 요청했습니다.", "주말 대응은 인력과 추가 비용을 산정한 별도 계약으로 다룹니다.", "추가 인력 비용 산정이 완료될 때까지 주말 대응 약속을 보류합니다.", "최수진이 9월 24일까지 기술지원팀의 인력 견적을 받습니다."],
  ["대체 업체 C 검증", "업체 C는 1,050만 원과 10월 9일 납기를 제안했습니다.", "금액 외에 품질 샘플과 납기 증빙을 함께 비교합니다.", "업체 C의 유상 샘플 검증을 진행합니다.", "이서연이 9월 25일까지 샘플 품질표를 작성합니다."],
  ["대체 업체 D 조건", "업체 D는 1,080만 원과 10월 5일 납기를 제안했으나 선금 50%를 요구합니다.", "선금 30% 초과 계약은 재무팀 검토가 필요합니다.", "재무팀의 현금흐름 검토를 받을 때까지 업체 D 발주를 보류합니다.", "김민수가 9월 25일까지 선금 30% 조정안을 협상합니다."],
  ["계약 갱신 알림", "9월 말 만료 계약 6건 중 2건은 담당자 확인이 빠져 있습니다.", "만료 14일 전에 갱신 의사와 담당자를 기록합니다.", "모든 갱신 계약에 정·부 담당자를 지정합니다.", "박지훈이 9월 21일까지 누락된 담당자 두 명을 지정합니다."],
  ["고객 인수 확인", "고객사 마루의 기능 검수는 끝났지만 인수 서명은 아직 없습니다.", "최종 인수 서명 이후 잔금 청구를 진행합니다.", "고객 인수 서명 전까지 잔금 청구를 보류합니다.", "최수진이 9월 22일까지 인수 확인서를 회수합니다."],
] as const;

// Explicitly authored synthetic examples. Never inserted into a shared database.
export const salesDemoRecords: DemoWorkspaceData = {
  sources: [
    { id: "sales-slack", title: "#영업-계약검토 · 합성", kind: "slack_channel" },
    ...[1, 2].map(n => ({ id: `sales-meeting-${n}`, title: `9월 ${n === 1 ? 16 : 18}일 영업 결정회의 · 합성`, kind: "meeting" })),
    ...topics.map(([title], i) => ({ id: `sales-doc-${i}`, title: `${title} 검토 문서 · 합성`, kind: "document" })),
  ],
  items: topics.flatMap(([title, fact, rule, decision, action], i) => {
    const meeting = `sales-meeting-${i < 4 ? 1 : 2}`;
    return [
      ["sales-slack", `${title}: ${fact}`, "decision"], ["sales-slack", rule, "info"], ["sales-slack", action, "action"],
      [meeting, `${title} 안건입니다. ${fact}`, "info"], [meeting, decision, "decision"], [meeting, action, "action"],
      [`sales-doc-${i}`, `${fact} ${rule}`, "info"], [`sales-doc-${i}`, `${decision} ${action}`, "decision"],
    ].map(([source_id, content, label], j) => ({ id: `sales-item-${i}-${j}`, source_id, content, label, spoken_at: `2026-09-${i < 4 ? "16" : "18"}T01:${String(i * 7 + j).padStart(2, "0")}:00+09:00`, author: ["이서연", "김민수", "박지훈", "최수진"][i % 4] }));
  }),
  decisions: topics.map(([, , rule, decision], i) => ({ id: `sales-decision-${i}`, source_id: `sales-meeting-${i < 4 ? 1 : 2}`, source_ids: [`sales-doc-${i}`], outcome: decision, rationale: rule, quote: decision, status: i % 2 === 1 ? "deferred" : "decided" })),
  summaries: {},
};

export type DemoRoleCriterion = { key: string; label: string; description: string; weight: number };
export type DemoRoleResultCriterion = { key: string; label: string; score: number | null; rationale: string | null; citations: { item_id: string | null; decision_id: string | null; quote: string }[]; evidence: "ok" | "no_evidence" };
export type DemoRoleEvaluation = {
  role: { id: string; name: string; instruction: string; criteria: DemoRoleCriterion[] };
  results: { id: string; role_id: string; source_id: string; status: "completed"; weighted_score: number; result: { summary: string; criteria: DemoRoleResultCriterion[] } }[];
};

const roleCriteria: DemoRoleCriterion[] = [
  { key: "principle", label: "원칙 부합", description: "부서 원칙을 문서 안에서 인용해 판단했는가", weight: 4 },
  { key: "clarity", label: "결정 명확성", description: "결정 또는 보류 사유가 한 문장으로 확정되어 있는가", weight: 3 },
  { key: "followup", label: "후속 조치", description: "담당자와 기한이 적혀 있는가", weight: 2 },
  { key: "alternatives", label: "대안 비교", description: "다른 선택지와 비교한 근거가 있는가", weight: 1 },
];

// [문서 index, 요약, 기준별 (점수, 판단 이유, topics 열 index) — null이면 근거 없음]. 인용은 topics 원문에서만 꺼낸다.
const roleReviews: [number, string, ([number, string, 2 | 3 | 4] | null)[]][] = [
  [0, "인상률 원칙을 인용해 재입찰을 결정했고 담당자·기한이 있습니다. 업체 선정 기준은 아직 없습니다.", [
    [5, "10% 기준을 그대로 인용해 12% 인상안을 재입찰 대상으로 판단했습니다.", 2],
    [4, "재입찰 결정은 분명하지만 어떤 기준으로 업체를 고를지는 적혀 있지 않습니다.", 3],
    [5, "담당자와 9월 21일 기한이 함께 적혀 있습니다.", 4],
    [4, "대체 업체 두 곳을 같은 범위로 비교하겠다고 밝혔습니다.", 3],
  ]],
  [4, "금액 외 비교 기준과 담당자·기한은 있으나, 샘플 검증의 합격 기준이 없습니다.", [
    [4, "금액만 보지 않는다는 비교 원칙을 인용했습니다.", 2],
    [3, "검증을 진행한다는 결정만 있고 합격·탈락 기준이 없습니다.", 3],
    [5, "담당자와 9월 25일 기한이 함께 적혀 있습니다.", 4],
    [4, "품질 샘플과 납기 증빙을 함께 비교하도록 정했습니다.", 2],
  ]],
  [5, "선금 한도 원칙에 따라 보류한 이유는 분명하지만, 다른 업체와 비교한 내용은 문서에 없습니다.", [
    [5, "선금 50% 요구를 30% 한도 원칙에 비춰 재무팀 검토 대상으로 판단했습니다.", 2],
    [4, "무엇을 기다리며 보류하는지가 한 문장으로 적혀 있습니다.", 3],
    [4, "담당자와 기한은 있으나 협상이 결렬될 때의 다음 단계는 없습니다.", 4],
    null,
  ]],
];
const totalRoleWeight = roleCriteria.reduce((sum, criterion) => sum + criterion.weight, 0);

// 영업 부서 문서 평가 체험용. salesDemoRecords 원문만 인용하며 공용 DB에는 넣지 않는다.
export const salesDemoRoleEvaluation: DemoRoleEvaluation = {
  role: { id: "sales-role-contract-review", name: "계약 검토 문서 평가", instruction: "영업 검토 문서가 부서 원칙을 인용해 결정을 내렸는지, 결정과 후속 조치가 분명한지 평가합니다. 문서에 근거가 없는 기준은 점수를 주지 않습니다.", criteria: roleCriteria },
  results: roleReviews.map(([doc, summary, reviews]) => {
    const criteria = roleCriteria.map(({ key, label }, i): DemoRoleResultCriterion => {
      const review = reviews[i];
      if (!review) return { key, label, score: null, rationale: null, citations: [], evidence: "no_evidence" };
      const [score, rationale, column] = review;
      return { key, label, score, rationale, citations: [{ item_id: `sales-item-${doc}-${column === 2 ? 6 : 7}`, decision_id: null, quote: topics[doc][column] }], evidence: "ok" };
    });
    const weighted = criteria.reduce((sum, criterion, i) => sum + (criterion.score ?? 0) * roleCriteria[i].weight, 0);
    return { id: `sales-role-result-${doc}`, role_id: "sales-role-contract-review", source_id: `sales-doc-${doc}`, status: "completed" as const, weighted_score: weighted / totalRoleWeight, result: { summary, criteria } };
  }).sort((a, b) => b.weighted_score - a.weighted_score),
};

const normalized = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
export function closestDemoAnswer<T extends { question: string; answer: string | null; quotes: string[] }>(question: string, answers: T[]): T | null {
  const input = normalized(question);
  if (input.length < 2) return null;
  const grams = new Set(Array.from({ length: input.length - 1 }, (_, i) => input.slice(i, i + 2)));
  const ranked = answers.filter(answer => answer.quotes.length > 0).map(answer => {
    const target = normalized(answer.question);
    const hits = [...grams].filter(gram => target.includes(gram)).length;
    return { answer, score: hits / grams.size };
  }).sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 0.3 ? ranked[0].answer : null;
}
