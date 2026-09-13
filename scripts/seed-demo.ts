import { loadEnvConfig } from "@next/env";
import { fileURLToPath } from "node:url";

import { createServiceSupabaseClient } from "../lib/supabase/service";

loadEnvConfig(process.cwd());

const IDS = {
  org: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  salesDept: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  devDept: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  planningDept: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
} as const;

type DemoDepartment = {
  id: string;
  name: string;
  sources: Array<{
    id: string;
    kind: "slack_channel" | "meeting" | "notion_page" | "document";
    external_id: string;
    title: string;
    visibility: "dept" | "leads_only";
    is_principles: boolean;
  }>;
  items: Array<{
    id: string;
    source_id: string;
    external_ref: string;
    author: string;
    content: string;
    label: "decision" | "action" | "info" | "chatter";
  }>;
  request: {
    id: string;
    origin_item_id: string;
    citation_item_ids: string[];
    title: string;
    background: string;
    recommendation: string;
    visibility: "dept" | "leads_only";
  };
  priorDecision: {
    id: string;
    outcome: string;
    rationale: string;
    item_id: string;
  };
  answers: Array<{
    id: string;
    question_key: string;
    question: string;
    answer: string;
    generic_answer: string;
    item_id: string;
  }>;
};

const SALES: DemoDepartment = {
  id: IDS.salesDept,
  name: "영업 사수",
  sources: [
    { id: "10000000-0000-4000-8000-000000000101", kind: "notion_page", external_id: "demo-sales-principles", title: "영업 원칙 문서", visibility: "dept", is_principles: true },
    { id: "10000000-0000-4000-8000-000000000102", kind: "slack_channel", external_id: "demo-sales-channel", title: "#영업-결정", visibility: "dept", is_principles: false },
    { id: "10000000-0000-4000-8000-000000000103", kind: "meeting", external_id: "demo-sales-meeting", title: "주간 영업회의", visibility: "leads_only", is_principles: false },
  ],
  items: [
    { id: "10000000-0000-4000-8000-000000000111", source_id: "10000000-0000-4000-8000-000000000101", external_ref: "sales-principle-1", author: "영업 원칙", content: "연 10% 이상 가격이 오르면 기존 거래를 자동 연장하지 않고 재입찰을 검토합니다.", label: "info" },
    { id: "10000000-0000-4000-8000-000000000112", source_id: "10000000-0000-4000-8000-000000000102", external_ref: "sales-slack-1", author: "민서", content: "외주사 B 견적이 12% 올랐습니다. 이번 견적을 받아도 될까요? 오늘 17시까지 방향이 필요합니다.", label: "decision" },
    { id: "10000000-0000-4000-8000-000000000113", source_id: "10000000-0000-4000-8000-000000000103", external_ref: "sales-meeting-1", author: "영업 리드", content: "경영회의 원칙에 따라 10% 이상 인상은 재입찰을 우선 검토하기로 보류했습니다.", label: "decision" },
    { id: "10000000-0000-4000-8000-000000000114", source_id: "10000000-0000-4000-8000-000000000102", external_ref: "sales-slack-2", author: "지후", content: "고객 인터뷰 일정은 다음 주 화요일 오전으로 잡았습니다.", label: "action" },
  ],
  request: { id: "10000000-0000-4000-8000-000000000121", origin_item_id: "10000000-0000-4000-8000-000000000112", citation_item_ids: ["10000000-0000-4000-8000-000000000112", "10000000-0000-4000-8000-000000000113"], title: "외주사 B 12% 인상 견적을 받아들일까요?", background: "슬랙에서 외주사 B의 견적 인상에 대한 결정을 요청했고, 오늘 17시까지 방향이 필요합니다.", recommendation: "부서 원칙에 따라 재입찰을 우선 검토하고, 예외 사유가 있으면 근거를 남기는 방향을 권합니다.", visibility: "leads_only" },
  priorDecision: { id: "10000000-0000-4000-8000-000000000122", outcome: "고객 인터뷰를 다음 주로 확정", rationale: "신규 고객군의 요구를 먼저 확인한 뒤 제안 범위를 좁히기로 했습니다.", item_id: "10000000-0000-4000-8000-000000000114" },
  answers: [
    { id: "10000000-0000-4000-8000-000000000131", question_key: "vendor-price", question: "외주사 B 견적을 받아도 되나요?", answer: "현재 기록에는 12% 인상안이 있고, 영업 원칙은 10% 이상 인상 시 재입찰 검토입니다. 예외가 필요하다면 팀장 결정이 먼저입니다.", generic_answer: "견적을 비교하고 예산과 일정 영향을 확인한 뒤 담당자 승인을 받으세요.", item_id: "10000000-0000-4000-8000-000000000112" },
    { id: "10000000-0000-4000-8000-000000000132", question_key: "interview", question: "고객 인터뷰는 언제 하나요?", answer: "기록상 고객 인터뷰는 다음 주 화요일 오전으로 잡혀 있습니다.", generic_answer: "캘린더에서 참석자와 목적을 확인하고 초대장을 보내세요.", item_id: "10000000-0000-4000-8000-000000000114" },
    { id: "10000000-0000-4000-8000-000000000133", question_key: "pricing", question: "가격을 올릴 때 기준이 있나요?", answer: "연 10% 이상 가격이 오르면 기존 거래를 자동 연장하지 않고 재입찰을 검토합니다.", generic_answer: "원가와 시장 가격을 확인하고 고객에게 변경 근거를 안내하세요.", item_id: "10000000-0000-4000-8000-000000000111" },
    { id: "10000000-0000-4000-8000-000000000134", question_key: "owner", question: "이 안건의 결정자는 누구인가요?", answer: "공개된 기록만으로 담당자를 확정할 수 없습니다. 현재 카드는 팀장 검토가 필요한 상태입니다.", generic_answer: "프로젝트 책임자와 예산 승인권자를 확인하세요.", item_id: "10000000-0000-4000-8000-000000000112" },
    { id: "10000000-0000-4000-8000-000000000135", question_key: "deadline", question: "언제까지 결정해야 하나요?", answer: "슬랙 기록에 오늘 17시까지 방향이 필요하다고 남아 있습니다.", generic_answer: "요청자와 마감 시각을 합의해 기록하세요.", item_id: "10000000-0000-4000-8000-000000000112" },
    { id: "10000000-0000-4000-8000-000000000136", question_key: "principle", question: "우리 부서 원칙은 무엇인가요?", answer: "10% 이상 가격 인상은 재입찰을 검토한다는 원칙이 있습니다.", generic_answer: "팀의 최신 원칙 문서를 확인하고 예외 조건을 기록하세요.", item_id: "10000000-0000-4000-8000-000000000111" },
  ],
};

const DEVELOPMENT: DemoDepartment = {
  id: IDS.devDept,
  name: "개발 사수",
  sources: [
    { id: "20000000-0000-4000-8000-000000000101", kind: "notion_page", external_id: "demo-dev-principles", title: "개발 원칙 문서", visibility: "dept", is_principles: true },
    { id: "20000000-0000-4000-8000-000000000102", kind: "slack_channel", external_id: "demo-dev-channel", title: "#개발-결정", visibility: "dept", is_principles: false },
    { id: "20000000-0000-4000-8000-000000000103", kind: "meeting", external_id: "demo-dev-meeting", title: "주간 개발회의", visibility: "leads_only", is_principles: false },
  ],
  items: [
    { id: "20000000-0000-4000-8000-000000000111", source_id: "20000000-0000-4000-8000-000000000101", external_ref: "dev-principle-1", author: "개발 원칙", content: "장애 대응은 원인 분석보다 먼저 영향 범위와 롤백 가능 여부를 확인합니다.", label: "info" },
    { id: "20000000-0000-4000-8000-000000000112", source_id: "20000000-0000-4000-8000-000000000102", external_ref: "dev-slack-1", author: "도윤", content: "이번 배포를 오늘 진행해도 될까요? 롤백 플랜 확인이 필요합니다.", label: "decision" },
    { id: "20000000-0000-4000-8000-000000000113", source_id: "20000000-0000-4000-8000-000000000103", external_ref: "dev-meeting-1", author: "개발 리드", content: "영향 범위가 확인되기 전에는 배포하지 않는 방향으로 보류했습니다.", label: "decision" },
    { id: "20000000-0000-4000-8000-000000000114", source_id: "20000000-0000-4000-8000-000000000102", external_ref: "dev-slack-2", author: "서연", content: "스테이징 로그 대시보드 링크를 문서에 추가했습니다.", label: "action" },
  ],
  request: { id: "20000000-0000-4000-8000-000000000121", origin_item_id: "20000000-0000-4000-8000-000000000112", citation_item_ids: ["20000000-0000-4000-8000-000000000112", "20000000-0000-4000-8000-000000000113"], title: "롤백 플랜 확인 전 배포를 진행할까요?", background: "개발 채널에서 오늘 배포 여부를 물었고, 영향 범위와 롤백 계획 확인이 남아 있습니다.", recommendation: "영향 범위와 롤백 가능 여부를 확인한 뒤 배포하는 방향을 권합니다.", visibility: "leads_only" },
  priorDecision: { id: "20000000-0000-4000-8000-000000000122", outcome: "스테이징 로그 대시보드 추가", rationale: "운영 배포 전에 확인 가능한 관측성을 확보하기로 했습니다.", item_id: "20000000-0000-4000-8000-000000000114" },
  answers: [
    { id: "20000000-0000-4000-8000-000000000131", question_key: "vendor-price", question: "외주사 B 견적을 받아도 되나요?", answer: "개발 사수에는 외주사 견적에 관한 기록이 없습니다. 개발 부서 원칙과 관련된 질문을 선택해 주세요.", generic_answer: "견적을 비교하고 예산과 일정 영향을 확인한 뒤 담당자 승인을 받으세요.", item_id: "20000000-0000-4000-8000-000000000111" },
    { id: "20000000-0000-4000-8000-000000000132", question_key: "interview", question: "고객 인터뷰는 언제 하나요?", answer: "개발 사수에는 고객 인터뷰 일정 기록이 없습니다.", generic_answer: "캘린더에서 참석자와 목적을 확인하고 초대장을 보내세요.", item_id: "20000000-0000-4000-8000-000000000114" },
    { id: "20000000-0000-4000-8000-000000000133", question_key: "pricing", question: "가격을 올릴 때 기준이 있나요?", answer: "개발 부서의 기록에는 가격 원칙이 없습니다.", generic_answer: "원가와 시장 가격을 확인하고 고객에게 변경 근거를 안내하세요.", item_id: "20000000-0000-4000-8000-000000000111" },
    { id: "20000000-0000-4000-8000-000000000134", question_key: "owner", question: "이 안건의 결정자는 누구인가요?", answer: "배포 안건은 개발 리드가 검토하고, 영향 범위와 롤백 계획을 먼저 확인합니다.", generic_answer: "프로젝트 책임자와 예산 승인권자를 확인하세요.", item_id: "20000000-0000-4000-8000-000000000112" },
    { id: "20000000-0000-4000-8000-000000000135", question_key: "deadline", question: "언제까지 결정해야 하나요?", answer: "현재 기록에는 오늘 배포 여부를 결정해야 한다는 요청이 있습니다.", generic_answer: "요청자와 마감 시각을 합의해 기록하세요.", item_id: "20000000-0000-4000-8000-000000000112" },
    { id: "20000000-0000-4000-8000-000000000136", question_key: "principle", question: "장애 대응 원칙은 무엇인가요?", answer: "원인 분석보다 먼저 영향 범위와 롤백 가능 여부를 확인합니다.", generic_answer: "팀의 최신 원칙 문서를 확인하고 예외 조건을 기록하세요.", item_id: "20000000-0000-4000-8000-000000000111" },
  ],
};

const PLANNING_SOURCE_IDS = {
  principles: "30000000-0000-4000-8000-000000000101",
  slack: "30000000-0000-4000-8000-000000000102",
  meeting: "30000000-0000-4000-8000-000000000103",
  budget: "30000000-0000-4000-8000-000000000104",
  deck: "30000000-0000-4000-8000-000000000105",
} as const;

const PLANNING_DIALOGUE: Array<[
  author: string,
  label: "decision" | "action" | "info" | "chatter",
  content: string,
]> = [
  ["정다은 인턴", "info", "어제 받은 경쟁사 3곳의 런칭 일정 비교표를 정리했습니다. 표의 2번 탭을 봐 주세요."],
  ["최민지 사원", "info", "경쟁사 A는 9월 20일, B는 9월 27일, C는 10월 4일에 베타를 시작합니다."],
  ["이준호 대리", "info", "우리 베타는 9월 18일이 목표인데 QA 2명이 비어 있습니다."],
  ["박서윤 과장", "info", "QA 외주를 쓰면 일정은 지킬 수 있지만 예산이 8% 늘어납니다."],
  ["김현우 팀장", "decision", "외주 QA 예산 1,800만원을 승인하고 9월 18일 베타를 진행해도 될까요? 금요일 17시까지 결정이 필요합니다."],
  ["박서윤 과장", "info", "기획팀 런칭 예산안.xlsx의 외주비 상한은 2,000만원입니다. 1,800만원은 상한 안입니다."],
  ["이준호 대리", "action", "민지님은 QA 업체 세 곳의 견적과 투입 가능일을 오늘 15시까지 받아 주세요."],
  ["최민지 사원", "action", "기존 거래처 두 곳과 신규 업체 한 곳에 문의하고 비교표를 업데이트하겠습니다."],
  ["정다은 인턴", "action", "업체 연락처와 지난 계약서 링크를 정리해 공유하겠습니다."],
  ["이준호 대리", "info", "기획팀 원칙은 일정 변경보다 고객 공지 가능성을 먼저 확인하는 것입니다."],
  ["김현우 팀장", "chatter", "오늘 점심은 김치찌개 어때요?"],
  ["정다은 인턴", "chatter", "저는 좋습니다. 회의실 예약도 확인해 둘게요 ㅎㅎ"],
  ["최민지 사원", "info", "런칭 의사결정 자료.pptx 3페이지에 일정 리스크를 추가했습니다."],
  ["박서윤 과장", "info", "슬라이드의 리스크 완화안에 고객 공지 초안도 넣으면 좋겠습니다."],
  ["이준호 대리", "action", "다은님은 고객 공지 초안을 13시까지 작성해 주세요."],
  ["정다은 인턴", "action", "공지 초안 1차본을 작성했습니다. 가격 변경 문구는 비워 두었습니다."],
  ["김현우 팀장", "decision", "가격 변경이 없는 베타이므로 공지에는 기능 범위와 점검 시간을 중심으로 쓰겠습니다."],
  ["박서윤 과장", "info", "고객사 세 곳은 모두 수요일 오전 공지를 선호한다고 답했습니다."],
  ["최민지 사원", "action", "고객 공지 문구를 수요일 10시 발송 기준으로 수정하겠습니다."],
  ["이준호 대리", "decision", "베타 시작일을 9월 18일로 유지하고, QA 완료 조건을 카드에 명시하겠습니다."],
  ["정다은 인턴", "info", "업체 A는 9월 16일 투입 가능, 업체 B는 9월 18일, 업체 C는 9월 23일입니다."],
  ["최민지 사원", "info", "업체 A 견적은 1,650만원이고 야간 테스트가 포함되지 않습니다."],
  ["최민지 사원", "info", "업체 B 견적은 1,780만원이고 야간 테스트까지 포함합니다."],
  ["박서윤 과장", "info", "업체 B가 일정과 범위 모두 맞지만, 야간 테스트 결과 공유 방식이 필요합니다."],
  ["최민지 사원", "action", "업체 B에 결과 리포트 샘플과 재테스트 조건을 요청했습니다."],
  ["정다은 인턴", "action", "업체 C는 가장 저렴하지만 투입일이 늦어 이번 베타에는 어렵습니다."],
  ["김현우 팀장", "decision", "업체 B를 우선협상 대상으로 두고, 리포트 샘플 확인 후 최종 승인하겠습니다."],
  ["박서윤 과장", "action", "예산 승인 메모를 작성하고 팀장님께 올리겠습니다."],
  ["이준호 대리", "action", "민지님은 QA 테스트 케이스 42개를 업체 B에 전달해 주세요."],
  ["최민지 사원", "action", "테스트 케이스를 우선순위별로 나눠 전달하겠습니다."],
  ["정다은 인턴", "info", "고객 문의 예상 질문 12개를 정리해 FAQ 초안에 반영했습니다."],
  ["박서윤 과장", "decision", "FAQ는 베타 공지와 함께 공유하고, 장애 문의는 전용 채널로 받겠습니다."],
  ["이준호 대리", "action", "전용 채널 생성과 담당자 배정을 오늘 안에 마무리하겠습니다."],
  ["최민지 사원", "info", "전용 채널 이름은 #beta-support로 제안합니다."],
  ["김현우 팀장", "info", "채널 이름은 좋습니다. 고객사별 태그 규칙도 문서에 추가해 주세요."],
  ["정다은 인턴", "action", "태그 규칙 예시를 만들어 의사결정 자료 5페이지에 추가하겠습니다."],
  ["박서윤 과장", "info", "예산안에서 잔여 220만원은 장애 대응 예비비로 남겨 두겠습니다."],
  ["김현우 팀장", "decision", "예비비 220만원은 유지하고 추가 집행은 팀장 승인으로 제한합니다."],
  ["이준호 대리", "info", "내일 오전에는 QA 킥오프, 오후에는 고객 공지 최종 검토를 진행합니다."],
  ["최민지 사원", "action", "킥오프 아젠다와 참석자 목록을 캘린더에 올렸습니다."],
  ["정다은 인턴", "chatter", "회의실 간식도 준비해 둘까요?"],
  ["박서윤 과장", "chatter", "커피만 있으면 충분할 것 같아요."],
  ["박서윤 과장", "info", "업체 B 리포트 샘플을 확인했고 케이스별 결과 필드가 모두 있습니다."],
  ["김현우 팀장", "decision", "업체 B와 1,780만원으로 계약을 진행합니다. 범위 변경은 사전 승인으로 합니다."],
  ["이준호 대리", "action", "계약서 초안을 받아 범위와 재테스트 조건을 확인하겠습니다."],
  ["최민지 사원", "action", "예산안.xlsx에 확정 금액과 예비비를 반영했습니다."],
  ["정다은 인턴", "action", "PPT 5페이지에 고객사 태그 예시를 추가하고 검토 요청을 보냈습니다."],
  ["박서윤 과장", "info", "기획팀 원칙 문서와 이번 결정의 예외 사유를 함께 보관했습니다."],
  ["김현우 팀장", "chatter", "오늘은 날씨가 선선하네요."],
  ["정다은 인턴", "chatter", "퇴근 전에 파일 정리까지 해 둘게요."],
  ["이준호 대리", "info", "QA 킥오프에서 장애 등급 기준을 합의했습니다."],
  ["최민지 사원", "action", "장애 등급 기준을 FAQ와 테스트 케이스에 반영하겠습니다."],
  ["박서윤 과장", "info", "베타 공지는 수요일 10시에 발송하는 일정으로 유지합니다."],
  ["김현우 팀장", "decision", "최종 공지와 QA 통과 확인을 베타 오픈의 필수 조건으로 하겠습니다."],
  ["이준호 대리", "action", "오픈 전 체크리스트를 오늘 18시까지 업데이트해 주세요."],
  ["최민지 사원", "action", "체크리스트에 권한과 로그 확인 항목을 추가했습니다."],
  ["정다은 인턴", "info", "고객사별 테스트 계정 6개를 생성했습니다."],
  ["박서윤 과장", "info", "테스트 계정은 베타 종료 후 회수할 예정입니다."],
  ["김현우 팀장", "chatter", "점심 먹고 2시에 다시 모이죠."],
  ["이준호 대리", "decision", "오늘 배포는 하지 않고 QA 리포트 확인 후 내일 오전에 오픈합니다."],
  ["박서윤 과장", "action", "내일 오전 오픈 여부를 9시 30분에 최종 확인하겠습니다."],
  ["최민지 사원", "info", "현재까지 치명도 높은 결함은 발견되지 않았습니다."],
  ["정다은 인턴", "action", "결함 현황 표를 업데이트하고 팀장님께 공유했습니다."],
  ["김현우 팀장", "info", "내일 오픈 기준을 충족하면 고객 공지를 그대로 발송합니다."],
  ["박서윤 과장", "chatter", "자료가 많이 쌓였으니 폴더 구조도 한 번 정리합시다."],
];

const planningItemId = (number: number): string =>
  `30000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

const PLANNING: DemoDepartment = {
  id: IDS.planningDept,
  name: "기획팀 사수",
  sources: [
    { id: PLANNING_SOURCE_IDS.principles, kind: "notion_page", external_id: "demo-planning-principles", title: "기획팀 원칙 문서", visibility: "dept", is_principles: true },
    { id: PLANNING_SOURCE_IDS.slack, kind: "slack_channel", external_id: "demo-planning-channel", title: "#기획-런칭", visibility: "dept", is_principles: false },
    { id: PLANNING_SOURCE_IDS.meeting, kind: "meeting", external_id: "demo-planning-meeting", title: "기획팀 런칭 결정회의", visibility: "leads_only", is_principles: false },
    { id: PLANNING_SOURCE_IDS.budget, kind: "document", external_id: "mockup:기획팀_9월_런칭_의사결정_목업.xlsx", title: "런칭 예산안.xlsx", visibility: "dept", is_principles: false },
    { id: PLANNING_SOURCE_IDS.deck, kind: "document", external_id: "mockup:기획팀_9월_런칭_의사결정_목업.pptx", title: "런칭 의사결정 자료.pptx", visibility: "leads_only", is_principles: false },
  ],
  items: [
    { id: planningItemId(101), source_id: PLANNING_SOURCE_IDS.principles, external_ref: "planning-principle-1", author: "기획팀 원칙", content: "기획팀은 일정 변경보다 고객 공지 가능성을 먼저 확인하고, 예산 상한을 넘는 집행은 팀장 승인을 받습니다.", label: "info" },
    ...PLANNING_DIALOGUE.map(([author, label, content], index) => ({
      id: planningItemId(index + 1),
      source_id: index < 42 ? PLANNING_SOURCE_IDS.slack : PLANNING_SOURCE_IDS.meeting,
      external_ref: index < 42 ? `planning-slack-${index + 1}` : `planning-meeting-${index + 1}`,
      author,
      content,
      label,
    })),
    { id: planningItemId(102), source_id: PLANNING_SOURCE_IDS.budget, external_ref: "xlsx:summary", author: "런칭 예산안.xlsx", content: "외주 QA 예산 상한은 2,000만원이며, 선택안은 업체 B 1,780만원입니다. 잔여 220만원은 장애 대응 예비비입니다.", label: "info" },
    { id: planningItemId(103), source_id: PLANNING_SOURCE_IDS.deck, external_ref: "pptx:slide-3", author: "런칭 의사결정 자료.pptx", content: "9월 18일 베타 목표, QA 업체 비교, 고객 공지, 장애 대응 기준을 함께 검토합니다.", label: "info" },
  ],
  request: { id: planningItemId(121), origin_item_id: planningItemId(5), citation_item_ids: [planningItemId(5)], title: "외주 QA 업체 B와 1,780만원으로 계약할까요?", background: "기획팀 Slack과 런칭 예산안에서 9월 18일 베타를 위해 외주 QA를 검토했습니다. 금요일 17시까지 결정이 필요합니다.", recommendation: "예산 상한 2,000만원 안에서 일정과 야간 테스트 범위를 충족하는 업체 B를 우선협상 대상으로 두고, 계약 범위 변경은 사전 승인으로 제한하는 방향을 권합니다.", visibility: "leads_only" },
  priorDecision: { id: planningItemId(122), outcome: "업체 B와 1,780만원으로 계약 진행", rationale: "베타 일정과 야간 테스트 범위를 함께 충족했고, 예산 상한 안에서 예비비 220만원을 남겼습니다.", item_id: planningItemId(44) },
  answers: [
    { id: planningItemId(131), question_key: "planning-vendor", question: "QA 업체 B를 선택한 이유는 무엇인가요?", answer: "기록상 업체 B는 1,780만원으로 예산 상한 2,000만원 안에 있고, 9월 18일 투입과 야간 테스트를 함께 충족합니다.", generic_answer: "업체별 일정·범위·비용을 비교하고 최종 승인자를 확인하세요.", item_id: planningItemId(44) },
    { id: planningItemId(132), question_key: "planning-deadline", question: "외주 QA 결정은 언제까지인가요?", answer: "김현우 팀장이 금요일 17시까지 결정이 필요하다고 남겼습니다.", generic_answer: "요청자와 결정 마감 시각을 합의해 기록하세요.", item_id: planningItemId(5) },
    { id: planningItemId(133), question_key: "planning-budget", question: "예산안에서 남는 금액은 어떻게 하나요?", answer: "런칭 예산안.xlsx와 과장 발언에 따르면 220만원을 장애 대응 예비비로 남기고 추가 집행은 팀장 승인으로 제한합니다.", generic_answer: "예산 상한과 예비비 사용 조건을 함께 확인하세요.", item_id: planningItemId(102) },
    { id: planningItemId(134), question_key: "planning-notice", question: "고객 공지는 언제 발송하나요?", answer: "기록에는 수요일 오전 10시 발송 일정이 있고, 베타 오픈 기준은 최종 공지와 QA 통과 확인입니다.", generic_answer: "공지 대상·발송 시각·최종 승인자를 확인하세요.", item_id: planningItemId(51) },
    { id: planningItemId(135), question_key: "planning-owner", question: "실무 자료와 테스트 케이스는 누가 맡았나요?", answer: "최민지 사원이 자료와 테스트 케이스를 맡고, 이준호 대리가 업체 커뮤니케이션과 실무 조율을 맡았습니다.", generic_answer: "업무별 담당자와 검토자를 분리해 기록하세요.", item_id: planningItemId(29) },
    { id: planningItemId(136), question_key: "planning-principle", question: "기획팀의 예산 원칙은 무엇인가요?", answer: "예산 상한을 넘는 집행은 팀장 승인을 받고, 일정 변경보다 고객 공지 가능성을 먼저 확인합니다.", generic_answer: "최신 부서 원칙 문서를 먼저 확인하세요.", item_id: planningItemId(101) },
  ],
};

const DEMO_DEPARTMENTS = [SALES, DEVELOPMENT, PLANNING];

async function removeExistingDemoData(
  client: ReturnType<typeof createServiceSupabaseClient>,
): Promise<void> {
  const departmentIds = DEMO_DEPARTMENTS.map((department) => department.id);
  const citationOwnerIds = DEMO_DEPARTMENTS.flatMap((department) => [
    department.request.id,
    department.priorDecision.id,
    ...department.answers.map((answer) => answer.id),
  ]);
  const conflictRequestIds = DEMO_DEPARTMENTS.map((department) => department.request.id);
  const itemIds = DEMO_DEPARTMENTS.flatMap((department) => department.items.map((item) => item.id));
  const { error: citationError } = await client.from("citations").delete().in("owner_id", citationOwnerIds);
  if (citationError) throw new Error("demo citation cleanup failed");
  const { error: conflictError } = await client.from("conflicts").delete().in("request_id", conflictRequestIds);
  if (conflictError) throw new Error("demo conflict cleanup failed");
  const { error: classificationError } = await client.from("classifications").delete().in("item_id", itemIds);
  if (classificationError) throw new Error("demo classification cleanup failed");
  const tables = ["decisions", "decision_requests", "answers", "items", "meetings", "sources", "members"] as const;
  for (const table of tables) {
    const { error } = await client.from(table).delete().in("dept_id", departmentIds);
    if (error) throw new Error(`demo cleanup failed: ${table}`);
  }
  const { error: departmentError } = await client.from("departments").delete().in("id", departmentIds);
  if (departmentError) throw new Error("demo department cleanup failed");
  const { error: orgError } = await client.from("orgs").delete().eq("id", IDS.org);
  if (orgError) throw new Error("demo org cleanup failed");
}

async function seedDepartment(
  client: ReturnType<typeof createServiceSupabaseClient>,
  department: DemoDepartment,
): Promise<void> {
  const { error: departmentError } = await client.from("departments").insert({
    id: department.id,
    org_id: IDS.org,
    name: department.name,
    template: "general",
  });
  if (departmentError) throw new Error("demo department seed failed");

  const { error: sourceError } = await client.from("sources").insert(
    department.sources.map((source) => ({ dept_id: department.id, ...source, active: true })),
  );
  if (sourceError) throw new Error("demo source seed failed");

  const { error: itemError } = await client.from("items").insert(
    department.items.map((item) => ({
      id: item.id,
      source_id: item.source_id,
      dept_id: department.id,
      external_ref: item.external_ref,
      author_ext_id: `demo-${department.id.slice(0, 4)}`,
      author: item.author,
      content: item.content,
      embed_status: "done",
      embed_model: "demo",
    })),
  );
  if (itemError) throw new Error("demo item seed failed");

  const { error: classificationError } = await client.from("classifications").insert(
    department.items.map((item) => ({
      item_id: item.id,
      label: item.label,
      method: "rule",
      confidence: 0.95,
      reasoning: "합성 데모 데이터",
    })),
  );
  if (classificationError) throw new Error("demo classification seed failed");

  const { error: requestError } = await client.from("decision_requests").insert({
    id: department.request.id,
    dept_id: department.id,
    title: department.request.title,
    background: department.request.background,
    recommendation: department.request.recommendation,
    visibility: department.request.visibility,
    status: "open",
    origin_item_id: department.request.origin_item_id,
  });
  if (requestError) throw new Error("demo request seed failed");

  const { error: decisionError } = await client.from("decisions").insert({
    id: department.priorDecision.id,
    dept_id: department.id,
    decided_by_name: `${department.name} 리드`,
    outcome: department.priorDecision.outcome,
    rationale: department.priorDecision.rationale,
    lead_time_min: 42,
  });
  if (decisionError) throw new Error("demo decision seed failed");

  const requestCitations = department.request.citation_item_ids.map((itemId) => {
    const item = department.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("demo request citation seed failed");
    return {
      owner_kind: "decision_request",
      owner_id: department.request.id,
      item_id: item.id,
      quote: item.content,
    };
  });
  const { error: requestCitationError } = await client.from("citations").insert(requestCitations);
  if (requestCitationError) throw new Error("demo request citation seed failed");

  const priorItem = department.items.find((item) => item.id === department.priorDecision.item_id);
  if (!priorItem) throw new Error("demo decision citation seed failed");
  const { error: decisionCitationError } = await client.from("citations").insert({
    owner_kind: "decision",
    owner_id: department.priorDecision.id,
    item_id: priorItem.id,
    quote: priorItem.content,
  });
  if (decisionCitationError) throw new Error("demo decision citation seed failed");

  const { error: conflictError } = await client.from("conflicts").insert({
    request_id: department.request.id,
    prior_decision_id: department.priorDecision.id,
    explanation: "과거 결정의 근거와 이번 안건을 함께 확인해야 합니다.",
  });
  if (conflictError) throw new Error("demo conflict seed failed");

  const { error: answerError } = await client.from("answers").insert(
    department.answers.map((answer) => ({
      id: answer.id,
      dept_id: department.id,
      question_key: answer.question_key,
      question: answer.question,
      answer: answer.answer,
      generic_answer: answer.generic_answer,
      status: "done",
      refused: false,
      verified: true,
    })),
  );
  if (answerError) throw new Error("demo answer seed failed");

  const answerCitations = department.answers.map((answer) => {
    const item = department.items.find((candidate) => candidate.id === answer.item_id);
    if (!item) throw new Error("demo answer citation seed failed");
    return { owner_kind: "answer", owner_id: answer.id, item_id: item.id, quote: item.content };
  });
  const { error: answerCitationError } = await client.from("citations").insert(answerCitations);
  if (answerCitationError) throw new Error("demo answer citation seed failed");
}

async function main(): Promise<void> {
  const client = createServiceSupabaseClient();
  await removeExistingDemoData(client);
  const { error: orgError } = await client.from("orgs").insert({
    id: IDS.org,
    name: "온새미로 주식회사",
    is_demo: true,
  });
  if (orgError) throw new Error("demo org seed failed");
  for (const department of DEMO_DEPARTMENTS) {
    await seedDepartment(client, department);
  }
  console.log("seed-demo complete: demo_org=1 departments=3 prepared_answers=18 planning_items=68");
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntrypoint) {
  main().catch((error: unknown) => {
    console.error("seed-demo failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  });
}
