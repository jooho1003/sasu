import type { TrailerScenario } from "@/lib/contracts";

// Authored synthetic content. Never replace these with internal records or raw utterances.
export const trailerScenarios: TrailerScenario[] = [
  {
    id: "supplier", title: "오래된 협력사의 새로운 견적",
    summary: "파란물류가 단가를 14% 올려 달라고 했어요. 비용도, 오래 쌓아 온 신뢰도 중요합니다. 운영 담당자인 당신은 어떤 결정을 내릴까요?",
    facts: [
      { id: "principle", place: "library", label: "협력사 계약 원칙", text: "연간 단가 인상이 10%를 넘으면 대안 견적을 비교한다. 거래를 유지할 때도 가격과 서비스 조건을 함께 기록한다." },
      { id: "meeting", place: "meeting", label: "지난 회의의 보류 안건", text: "파란물류의 14% 인상 요청은 예산 확인을 기다리며 보류됐다. 계약 갱신까지 3주가 남았다." },
      { id: "request", place: "messenger", label: "운영팀의 메시지", text: "이번 달 출고는 평소보다 많다. 협력사를 바꾸면 인수인계에 2주가 필요하다." },
      { id: "budget", place: "finance", label: "재무 담당의 예산 메모", text: "현재 물류 예산의 여유는 8%다. 14% 인상을 전부 수용하려면 다른 지출을 줄여야 한다." },
      { id: "history", place: "partner", label: "협력 담당의 거래 메모", text: "파란물류와 3년간 거래했고 최근 1년간 배송 사고는 없었다. 물량을 보장하면 인상률 협상이 가능하다." },
    ],
    dialogues: [
      { id: "budget-question", place: "finance", question: "인상을 받아들일 예산이 있나요?", fact_id: "budget", quote: "현재 물류 예산의 여유는 8%다. 14% 인상을 전부 수용하려면 다른 지출을 줄여야 한다." },
      { id: "history-question", place: "partner", question: "거래를 유지할 이유와 협상 여지가 있나요?", fact_id: "history", quote: "파란물류와 3년간 거래했고 최근 1년간 배송 사고는 없었다. 물량을 보장하면 인상률 협상이 가능하다." },
    ],
    choices: [{ id: "accept", label: "인상 요청 수용" }, { id: "compare", label: "대안 견적 비교" }, { id: "negotiate", label: "조건부 인상 협상" }],
    ending: { choice_id: "compare", fact_id: "principle", quote: "연간 단가 인상이 10%를 넘으면 대안 견적을 비교한다." },
  },
  {
    id: "launch", title: "출시일은 그대로, 기능은 어디까지?",
    summary: "새 주문 화면의 공개까지 5일. 팀은 마지막 기능을 더 넣고 싶지만 검증 시간은 부족해요. 오늘 출시 범위를 정해야 합니다.",
    facts: [
      { id: "principle", place: "library", label: "출시 원칙", text: "결제와 주문에 영향을 주는 변경은 검증을 마친 뒤 공개한다. 부가 기능은 핵심 흐름과 분리해 순차 출시할 수 있다." },
      { id: "meeting", place: "meeting", label: "출시 점검 회의", text: "핵심 주문 흐름은 검증을 마쳤다. 추천 상품 기능은 아직 결제 화면과의 호환 검증을 마치지 못했다." },
      { id: "request", place: "messenger", label: "개발팀의 메시지", text: "추천 상품 기능을 분리하는 데 반나절이 필요하다. 전체 검증은 최소 4일이 걸린다." },
      { id: "budget", place: "finance", label: "운영 담당의 일정 메모", text: "출시 안내는 이미 전달됐지만 추천 상품 기능은 약속한 필수 범위에 들어 있지 않다." },
      { id: "history", place: "partner", label: "고객 담당의 요청 메모", text: "고객이 가장 기다리는 것은 주문 단계 단축이다. 추천 상품보다 결제 안정성을 먼저 확인하고 싶어 한다." },
    ],
    dialogues: [
      { id: "budget-question", place: "finance", question: "공개 범위를 줄여도 약속을 지킬 수 있나요?", fact_id: "budget", quote: "출시 안내는 이미 전달됐지만 추천 상품 기능은 약속한 필수 범위에 들어 있지 않다." },
      { id: "history-question", place: "partner", question: "고객에게 가장 중요한 것은 무엇인가요?", fact_id: "history", quote: "고객이 가장 기다리는 것은 주문 단계 단축이다. 추천 상품보다 결제 안정성을 먼저 확인하고 싶어 한다." },
    ],
    choices: [{ id: "all", label: "모든 기능을 함께 출시" }, { id: "core", label: "검증된 핵심 기능 먼저 출시" }, { id: "delay", label: "전체 출시 일정 연기" }],
    ending: { choice_id: "core", fact_id: "principle", quote: "부가 기능은 핵심 흐름과 분리해 순차 출시할 수 있다." },
  },
  {
    id: "customer", title: "중요한 고객의 급한 부탁",
    summary: "솔빛상점에서 이번 주 안에 전용 보고서를 만들어 달라고 했어요. 다음 주에 여러 고객이 기다리는 개선도 예정되어 있습니다. 무엇을 먼저 할까요?",
    facts: [
      { id: "principle", place: "library", label: "요청 우선순위 원칙", text: "기존 약속을 바꾸기 전 영향을 받는 고객과 범위를 확인한다. 긴급 요청에는 작은 대안을 먼저 제시하고 추가 범위를 합의한다." },
      { id: "meeting", place: "meeting", label: "주간 업무 회의", text: "다음 주 공통 보고서 개선을 세 고객에게 약속했다. 솔빛상점 전용 보고서는 기존 계약 범위 밖이다." },
      { id: "request", place: "messenger", label: "구현 담당의 메시지", text: "전용 보고서를 모두 만들려면 3일이 필요하다. 기존 내보내기로 핵심 수치만 전달하면 반나절이면 된다." },
      { id: "budget", place: "finance", label: "운영 담당의 리소스 메모", text: "이번 주 남은 작업 여유는 하루다. 전용 보고서를 모두 만들면 공통 개선 일정이 이틀 늦어진다." },
      { id: "history", place: "partner", label: "고객 담당의 요구 메모", text: "솔빛상점은 금요일 회의에 쓸 매출 합계가 급하다. 보고서 모양은 회의 뒤에 조정해도 된다고 했다." },
    ],
    dialogues: [
      { id: "budget-question", place: "finance", question: "전부 처리하면 다른 일정에 어떤 영향이 있나요?", fact_id: "budget", quote: "이번 주 남은 작업 여유는 하루다. 전용 보고서를 모두 만들면 공통 개선 일정이 이틀 늦어진다." },
      { id: "history-question", place: "partner", question: "고객이 당장 필요한 것은 무엇인가요?", fact_id: "history", quote: "솔빛상점은 금요일 회의에 쓸 매출 합계가 급하다. 보고서 모양은 회의 뒤에 조정해도 된다고 했다." },
    ],
    choices: [{ id: "custom", label: "전용 보고서 우선 제작" }, { id: "small", label: "핵심 수치 제공 후 범위 협의" }, { id: "planned", label: "기존 일정 유지, 요청 보류" }],
    ending: { choice_id: "small", fact_id: "principle", quote: "긴급 요청에는 작은 대안을 먼저 제시하고 추가 범위를 합의한다." },
  },
];
