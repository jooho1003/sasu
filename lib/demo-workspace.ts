export type DemoSource = { id: string; title: string; kind: string };
export type DemoItem = { id: string; source_id: string; content: string; author: string | null; label: string };
export type DemoDecision = { id: string; source_id: string; source_ids?: string[]; outcome: string; rationale: string; quote: string; status: "decided" | "deferred"; supersedes_id?: string; request_id?: string };
export type DemoWorkspaceData = { sources: DemoSource[]; items: DemoItem[]; decisions: DemoDecision[] };

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
    ].map(([source_id, content, label], j) => ({ id: `sales-item-${i}-${j}`, source_id, content, label, author: ["이서연", "김민수", "박지훈", "최수진"][i % 4] }));
  }),
  decisions: topics.map(([, , rule, decision], i) => ({ id: `sales-decision-${i}`, source_id: `sales-meeting-${i < 4 ? 1 : 2}`, source_ids: [`sales-doc-${i}`], outcome: decision, rationale: rule, quote: decision, status: i % 2 === 1 ? "deferred" : "decided" })),
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
