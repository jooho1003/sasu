import {
  SalesReviewChoice,
  SalesReviewFocus,
  SalesReviewResult,
  type SalesReviewChoice as SalesReviewChoiceValue,
  type SalesReviewFocus as SalesReviewFocusValue,
  type SalesReviewResult as SalesReviewResultValue,
} from "@/lib/contracts";

// ADR-075: 이 자료는 고정 합성 사례다. 실제 고객/견적 자료와 연결하지 않는다.
export const SALES_CASE_SOURCES = {
  S1: [
    "사용 인원을 100명에서 140명으로 늘리고 SSO도 넣고 싶습니다.",
    "첫 12개월 총액은 기존 14,000,000원(부가세 별도) 그대로면 좋겠습니다.",
    "서비스 시작일을 2026-10-20으로 앞당길 수 있나요?",
    "2026-10-02까지 답변 부탁드립니다.",
  ].join("\n"),
  S2: [
    "구독: 100명 / 12개월 / 12,000,000원(부가세 별도).",
    "도입: 2,000,000원(부가세 별도).",
    "첫 12개월 총액: 14,000,000원(부가세 별도).",
    "서비스 시작 예정일: 2026-11-01.",
  ].join("\n"),
  S3: [
    "구독: 140명 / 12개월 / 15,000,000원(부가세 별도).",
    "도입: 2,000,000원(부가세 별도).",
    "SSO 설정: 3,000,000원(부가세 별도).",
    "첫 12개월 총액: 20,000,000원(부가세 별도).",
    "서비스 시작 예정일: 2026-11-01(구축 일정 확인 전).",
  ].join("\n"),
  S4: [
    "총액 변경과 할인 약속은 영업팀장의 승인을 받아야 한다.",
    "구축 일정 단축은 구축 담당자의 가능 여부를 확인하고 영업팀장이 확정한다.",
    "대외 견적과 고객 회신은 영업팀장 승인 후 발송한다.",
    "미확인 조건을 확정 사실처럼 고객에게 안내하지 않는다.",
  ].join("\n"),
} as const;

export const SALES_CASE_TITLES = {
  S1: "가상 고객 요청",
  S2: "기존 견적 Q-001",
  S3: "변경 견적 초안 Q-001-R1",
  S4: "가상 영업 원칙 P-001",
} as const;

type SourceId = keyof typeof SALES_CASE_SOURCES;
type QuoteRef = readonly [SourceId, string];

function line(text: string, ...refs: QuoteRef[]): SalesReviewResultValue["comparison"][number] {
  const citations = refs.map(([source_id, quote]) => {
    if (!SALES_CASE_SOURCES[source_id].includes(quote)) throw new Error("sales_review_citation_invalid");
    return { source_id, quote };
  });
  if (!text || citations.length === 0) throw new Error("sales_review_citation_invalid");
  return { text, citations };
}

const QUOTE_OLD_SEATS = "구독: 100명 / 12개월 / 12,000,000원(부가세 별도).";
const QUOTE_NEW_SEATS = "구독: 140명 / 12개월 / 15,000,000원(부가세 별도).";
const QUOTE_OLD_TOTAL = "첫 12개월 총액: 14,000,000원(부가세 별도).";
const QUOTE_NEW_TOTAL = "첫 12개월 총액: 20,000,000원(부가세 별도).";
const QUOTE_REQUEST_PRICE = "첫 12개월 총액은 기존 14,000,000원(부가세 별도) 그대로면 좋겠습니다.";
const QUOTE_REQUEST_DATE = "서비스 시작일을 2026-10-20으로 앞당길 수 있나요?";
const QUOTE_NEW_DATE = "서비스 시작 예정일: 2026-11-01(구축 일정 확인 전).";
const QUOTE_PRICE_POLICY = "총액 변경과 할인 약속은 영업팀장의 승인을 받아야 한다.";
const QUOTE_DATE_POLICY = "구축 일정 단축은 구축 담당자의 가능 여부를 확인하고 영업팀장이 확정한다.";
const QUOTE_SEND_POLICY = "대외 견적과 고객 회신은 영업팀장 승인 후 발송한다.";

export function buildSalesReview(
  rawFocus: SalesReviewFocusValue,
  rawChoice: SalesReviewChoiceValue,
): SalesReviewResultValue {
  const focus = SalesReviewFocus.parse(rawFocus);
  const choice = SalesReviewChoice.parse(rawChoice);
  const priority = focus === "all" ? choice.priority : focus;
  const questions = {
    price: line("팀장에게 고객 희망 총액을 제안할지, 어떤 조건으로 검토할지 확인해 주세요.", ["S1", QUOTE_REQUEST_PRICE], ["S4", QUOTE_PRICE_POLICY]),
    schedule: line("구축 담당자에게 2026-10-20 시작이 가능한지 확인해 주세요.", ["S1", QUOTE_REQUEST_DATE], ["S4", QUOTE_DATE_POLICY]),
    sso: line("고객에게 필요한 SSO 범위와 설정 조건을 확인해 주세요.", ["S1", "사용 인원을 100명에서 140명으로 늘리고 SSO도 넣고 싶습니다."], ["S3", "SSO 설정: 3,000,000원(부가세 별도)."]),
  };
  const order = [priority, ...(["price", "schedule", "sso"] as const).filter((key) => key !== priority)];
  const reply_draft = choice.reply_style === "brief" ? [
    line("요청하신 인원 확대·SSO·시작일 조정을 확인했습니다.", ["S1", "사용 인원을 100명에서 140명으로 늘리고 SSO도 넣고 싶습니다."], ["S1", QUOTE_REQUEST_DATE]),
    line("가격과 구축 일정을 내부 확인한 뒤 답변드리겠습니다.", ["S4", QUOTE_PRICE_POLICY], ["S4", QUOTE_DATE_POLICY]),
  ] : [
    line("인원 확대와 SSO 적용 요청을 확인했습니다.", ["S1", "사용 인원을 100명에서 140명으로 늘리고 SSO도 넣고 싶습니다."]),
    line("시작일을 2026-10-20으로 조정할 수 있는지 확인하겠습니다.", ["S1", QUOTE_REQUEST_DATE], ["S4", QUOTE_DATE_POLICY]),
    line("견적 조건은 내부 검토 뒤 안내드리겠습니다.", ["S1", QUOTE_REQUEST_PRICE], ["S4", QUOTE_PRICE_POLICY]),
  ];
  const oldTotal = 12_000_000 + 2_000_000;
  const newTotal = 15_000_000 + 2_000_000 + 3_000_000;
  return {
    case_version: 1,
    focus,
    priority,
    reply_style: choice.reply_style,
    total_delta_krw: newTotal - oldTotal,
    comparison: [
      line("구독 좌석은 기존 100명에서 변경 견적 초안 140명으로 늘었습니다.", ["S2", QUOTE_OLD_SEATS], ["S3", QUOTE_NEW_SEATS]),
      line("구독 금액은 기존 12,000,000원에서 변경 견적 초안 15,000,000원으로 바뀌었습니다.", ["S2", QUOTE_OLD_SEATS], ["S3", QUOTE_NEW_SEATS]),
      line("변경 견적 초안에는 SSO 설정 3,000,000원이 추가됐습니다.", ["S3", "SSO 설정: 3,000,000원(부가세 별도)."]),
      line(`첫 12개월 견적 총액은 기존보다 ${(newTotal - oldTotal).toLocaleString("ko-KR")}원 높습니다.`, ["S2", QUOTE_OLD_TOTAL], ["S3", QUOTE_NEW_TOTAL]),
      line("고객은 기존 14,000,000원 유지를 희망하지만 변경 견적 초안은 20,000,000원입니다.", ["S1", QUOTE_REQUEST_PRICE], ["S3", QUOTE_NEW_TOTAL]),
      line("고객은 2026-10-20 시작을 희망하지만 변경 견적 초안에는 2026-11-01이 적혀 있습니다.", ["S1", QUOTE_REQUEST_DATE], ["S3", QUOTE_NEW_DATE]),
    ],
    policy_flags: [
      line("총액 변경이나 할인 약속은 영업팀장 승인이 필요합니다.", ["S4", QUOTE_PRICE_POLICY]),
      line("시작일 단축은 구축 담당자 가능 여부를 확인하고 영업팀장이 확정해야 합니다.", ["S4", QUOTE_DATE_POLICY]),
      line("대외 견적과 고객 회신은 영업팀장 승인 뒤 발송할 수 있습니다.", ["S4", QUOTE_SEND_POLICY]),
    ],
    questions: order.map((key) => questions[key]),
    reply_draft,
  };
}

export function safeSalesReviewResult(value: unknown): SalesReviewResultValue | null {
  const parsed = SalesReviewResult.safeParse(value);
  if (!parsed.success) return null;
  const result = parsed.data;
  const canonical = buildSalesReview(result.focus, { priority: result.priority, reply_style: result.reply_style });
  if (JSON.stringify(result) !== JSON.stringify(canonical)) return null;
  for (const entry of [...result.comparison, ...result.policy_flags, ...result.questions, ...result.reply_draft]) {
    if (!entry.citations.every(({ source_id, quote }) => SALES_CASE_SOURCES[source_id].includes(quote))) return null;
  }
  return result;
}
