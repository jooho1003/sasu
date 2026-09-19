import { loadEnvConfig } from "@next/env";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { weightedScore, type VerifiedCriterion } from "../lib/agent-role";
import type { DocumentSummary } from "../lib/contracts";
import { createServiceSupabaseClient } from "../lib/supabase/service";
import { parseDemoTrailerSnapshot, parseDemoAttemptsSnapshot } from "../lib/trailer-snapshot";
import { DEFAULT_TRAILER_RUBRIC } from "../lib/trailer-generation";
import { trailerApprovalItems } from "../lib/trailer-gate";
import { mask } from "../lib/mask";
import { buildDemoRetros } from "../fixtures/retro/days";
import { hiringMissions } from "../fixtures/hiring/missions";
import {
  DEMO_ORG_ID,
  DEMO_NOTION_EXCLUSIONS,
  DEMO_NOTION_ROOTS,
  DEMO_NOTION_SOURCES,
  DEMO_REVIEWER_ID,
  demoAutoLoginEnabled,
  demoReviewerEmail,
} from "../lib/demo-access";

loadEnvConfig(process.cwd());

const IDS = {
  org: DEMO_ORG_ID,
  salesDept: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  devDept: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  planningDept: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
} as const;

const DEMO_DEV_LEAD_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccc01";
export const DEMO_TRAILER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccf01";
export const DEMO_TRAILER_SLUG = "onsaemiro2026demotrail";
export const DEMO_TRAILER_DEPT_ID = IDS.devDept;

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
    active?: boolean;
    root_id?: string;
    parent_external_id?: string | null;
    last_synced_at?: string | null;
    last_error?: string | null;
    auto_sync?: boolean;
    import_version?: number;
    ingest_mode?: "classify" | "reference";
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
  extraRequests?: Array<{
    id: string;
    origin_item_id: string;
    citation_item_ids: string[];
    title: string;
    background: string;
    recommendation: string;
    visibility: "dept" | "leads_only";
  }>;
  priorDecision: {
    id: string;
    outcome: string;
    rationale: string;
    item_id: string;
  };
  extraPriorDecisions?: Array<{
    id: string;
    outcome: string;
    rationale: string;
    item_id: string;
  }>;
  conflict_explanation?: string;
  answers: Array<{
    id: string;
    question_key: string;
    question: string;
    answer: string;
    generic_answer: string;
    refused: boolean;
    item_ids: string[];
  }>;
};

function demoNotionSources(deptId: string): DemoDepartment["sources"] {
  return DEMO_NOTION_SOURCES.filter((source) => source.dept_id === deptId).map(
    ({ dept_id, ...source }) => {
      if (dept_id !== deptId) throw new Error("demo Notion source department mismatch");
      return {
        ...source,
        kind: "notion_page" as const,
        auto_sync: false,
        import_version: 2,
        ingest_mode: "reference" as const,
      };
    },
  );
}

const SALES: DemoDepartment = {
  id: IDS.salesDept,
  name: "영업 사수",
  sources: [
    ...demoNotionSources(IDS.salesDept),
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
  priorDecision: { id: "10000000-0000-4000-8000-000000000122", outcome: "10% 이상 인상은 자동 연장하지 않고 재입찰 검토", rationale: "연간 가격 인상이 10% 이상이면 기존 거래를 그대로 연장하지 않고 대안을 비교하기로 했습니다.", item_id: "10000000-0000-4000-8000-000000000111" },
  conflict_explanation: "이번 12% 인상안을 그대로 수용하면, 10% 이상 인상 시 재입찰을 검토한다는 과거 결정과 충돌합니다.",
  answers: [
    { id: "10000000-0000-4000-8000-000000000131", question_key: "vendor-price", question: "외주사 B 견적을 받아도 되나요?", answer: "현재 기록에는 12% 인상안이 있고, 영업 원칙은 10% 이상 인상 시 재입찰 검토입니다.", generic_answer: "견적을 비교하고 예산과 일정 영향을 확인한 뒤 담당자 승인을 받으세요.", refused: false, item_ids: ["10000000-0000-4000-8000-000000000112", "10000000-0000-4000-8000-000000000111"] },
    { id: "10000000-0000-4000-8000-000000000132", question_key: "interview", question: "고객 인터뷰는 언제 하나요?", answer: "기록상 고객 인터뷰는 다음 주 화요일 오전으로 잡혀 있습니다.", generic_answer: "캘린더에서 참석자와 목적을 확인하고 초대장을 보내세요.", refused: false, item_ids: ["10000000-0000-4000-8000-000000000114"] },
    { id: "10000000-0000-4000-8000-000000000133", question_key: "pricing", question: "가격을 올릴 때 기준이 있나요?", answer: "연 10% 이상 가격이 오르면 기존 거래를 자동 연장하지 않고 재입찰을 검토합니다.", generic_answer: "원가와 시장 가격을 확인하고 고객에게 변경 근거를 안내하세요.", refused: false, item_ids: ["10000000-0000-4000-8000-000000000111"] },
    { id: "10000000-0000-4000-8000-000000000134", question_key: "owner", question: "이 안건의 결정자는 누구인가요?", answer: "현재 확인 가능한 기록에는 결정자가 명시되지 않았습니다. 마감이 있는 가격 안건을 먼저 확인해 주세요.", generic_answer: "프로젝트 책임자와 예산 승인권자를 확인하세요.", refused: true, item_ids: [] },
    { id: "10000000-0000-4000-8000-000000000135", question_key: "deadline", question: "언제까지 결정해야 하나요?", answer: "슬랙 기록에 오늘 17시까지 방향이 필요하다고 남아 있습니다.", generic_answer: "요청자와 마감 시각을 합의해 기록하세요.", refused: false, item_ids: ["10000000-0000-4000-8000-000000000112"] },
    { id: "10000000-0000-4000-8000-000000000136", question_key: "principle", question: "우리 부서 원칙은 무엇인가요?", answer: "10% 이상 가격 인상은 재입찰을 검토한다는 원칙이 있습니다.", generic_answer: "팀의 최신 원칙 문서를 확인하고 예외 조건을 기록하세요.", refused: false, item_ids: ["10000000-0000-4000-8000-000000000111"] },
  ],
};

const DEVELOPMENT: DemoDepartment = {
  id: IDS.devDept,
  name: "개발 사수",
  sources: [
    ...demoNotionSources(IDS.devDept),
    { id: "20000000-0000-4000-8000-000000000102", kind: "slack_channel", external_id: "demo-dev-channel", title: "#개발-결정", visibility: "dept", is_principles: false },
    { id: "20000000-0000-4000-8000-000000000103", kind: "meeting", external_id: "demo-dev-meeting", title: "주간 개발회의", visibility: "leads_only", is_principles: false },
    { id: "20000000-0000-4000-8000-000000000104", kind: "document", external_id: "demo-dev-applicant-a", title: "지원서 — 지원자 A (합성)", visibility: "dept", is_principles: false },
    { id: "20000000-0000-4000-8000-000000000105", kind: "document", external_id: "demo-dev-applicant-b", title: "지원서 — 지원자 B (합성)", visibility: "dept", is_principles: false },
    { id: "20000000-0000-4000-8000-000000000106", kind: "document", external_id: "demo-dev-applicant-c", title: "지원서 — 지원자 C (합성)", visibility: "dept", is_principles: false },
  ],
  items: [
    { id: "20000000-0000-4000-8000-000000000111", source_id: "20000000-0000-4000-8000-000000000101", external_ref: "dev-principle-1", author: "개발 원칙", content: "장애 대응은 원인 분석보다 먼저 영향 범위와 롤백 가능 여부를 확인합니다.", label: "info" },
    { id: "20000000-0000-4000-8000-000000000112", source_id: "20000000-0000-4000-8000-000000000102", external_ref: "dev-slack-1", author: "도윤", content: "이번 배포를 오늘 진행해도 될까요? 롤백 플랜 확인이 필요합니다.", label: "decision" },
    { id: "20000000-0000-4000-8000-000000000113", source_id: "20000000-0000-4000-8000-000000000103", external_ref: "dev-meeting-1", author: "개발 리드", content: "영향 범위가 확인되기 전에는 배포하지 않는 방향으로 보류했습니다.", label: "decision" },
    { id: "20000000-0000-4000-8000-000000000114", source_id: "20000000-0000-4000-8000-000000000102", external_ref: "dev-slack-2", author: "서연", content: "스테이징 로그 대시보드 링크를 문서에 추가했습니다.", label: "action" },
    { id: "20000000-0000-4000-8000-000000000141", source_id: "20000000-0000-4000-8000-000000000104", external_ref: "applicant-a-1", author: "지원자 A", content: "Next.js App Router와 Supabase RLS로 사내 승인 도구를 만들었습니다.", label: "info" },
    { id: "20000000-0000-4000-8000-000000000142", source_id: "20000000-0000-4000-8000-000000000104", external_ref: "applicant-a-2", author: "지원자 A", content: "결정 기록을 문서화하고 변경 이유를 팀과 함께 검토하는 습관이 있습니다.", label: "info" },
    { id: "20000000-0000-4000-8000-000000000143", source_id: "20000000-0000-4000-8000-000000000104", external_ref: "applicant-a-3", author: "지원자 A", content: "운영 중에는 영향 범위와 롤백 절차를 체크리스트로 남겼습니다.", label: "info" },
    { id: "20000000-0000-4000-8000-000000000144", source_id: "20000000-0000-4000-8000-000000000105", external_ref: "applicant-b-1", author: "지원자 B", content: "여러 서비스의 API와 데이터 처리 작업을 맡아 백엔드 운영 경험을 쌓았습니다.", label: "info" },
    { id: "20000000-0000-4000-8000-000000000145", source_id: "20000000-0000-4000-8000-000000000105", external_ref: "applicant-b-2", author: "지원자 B", content: "운영 이슈의 원인과 대응 과정을 짧은 문서로 정리해 공유했습니다.", label: "info" },
    { id: "20000000-0000-4000-8000-000000000146", source_id: "20000000-0000-4000-8000-000000000106", external_ref: "applicant-c-1", author: "지원자 C", content: "사용자 화면의 컴포넌트 구조와 인터랙션을 개선하는 프론트엔드 작업을 주로 했습니다.", label: "info" },
    { id: "20000000-0000-4000-8000-000000000147", source_id: "20000000-0000-4000-8000-000000000106", external_ref: "applicant-c-2", author: "지원자 C", content: "시각적 완성도와 사용 흐름을 다듬는 데 집중했습니다.", label: "info" },
  ],
  request: { id: "20000000-0000-4000-8000-000000000121", origin_item_id: "20000000-0000-4000-8000-000000000112", citation_item_ids: ["20000000-0000-4000-8000-000000000112", "20000000-0000-4000-8000-000000000113"], title: "롤백 플랜 확인 전 배포를 진행할까요?", background: "개발 채널에서 오늘 배포 여부를 물었고, 영향 범위와 롤백 계획 확인이 남아 있습니다.", recommendation: "영향 범위와 롤백 가능 여부를 확인한 뒤 배포하는 방향을 권합니다.", visibility: "leads_only" },
  priorDecision: { id: "20000000-0000-4000-8000-000000000122", outcome: "스테이징 로그 대시보드 추가", rationale: "운영 배포 전에 확인 가능한 관측성을 확보하기로 했습니다.", item_id: "20000000-0000-4000-8000-000000000114" },
  answers: [
    { id: "20000000-0000-4000-8000-000000000131", question_key: "vendor-price", question: "외주사 B 견적을 받아도 되나요?", answer: "개발 부서 기록에서는 외주사 B 견적을 확인할 수 없습니다. 개발 원칙 질문을 선택해 주세요.", generic_answer: "견적을 비교하고 예산과 일정 영향을 확인한 뒤 담당자 승인을 받으세요.", refused: true, item_ids: [] },
    { id: "20000000-0000-4000-8000-000000000132", question_key: "interview", question: "고객 인터뷰는 언제 하나요?", answer: "개발 부서 기록에서는 고객 인터뷰 일정을 확인할 수 없습니다. 개발 원칙 질문을 선택해 주세요.", generic_answer: "캘린더에서 참석자와 목적을 확인하고 초대장을 보내세요.", refused: true, item_ids: [] },
    { id: "20000000-0000-4000-8000-000000000133", question_key: "pricing", question: "가격을 올릴 때 기준이 있나요?", answer: "개발 부서 기록에서는 가격 원칙을 확인할 수 없습니다. 개발 원칙 질문을 선택해 주세요.", generic_answer: "원가와 시장 가격을 확인하고 고객에게 변경 근거를 안내하세요.", refused: true, item_ids: [] },
    { id: "20000000-0000-4000-8000-000000000134", question_key: "owner", question: "이 안건의 결정자는 누구인가요?", answer: "현재 확인 가능한 기록에는 결정자가 명시되지 않았습니다. 배포 전에 확인할 원칙을 먼저 살펴보세요.", generic_answer: "프로젝트 책임자와 예산 승인권자를 확인하세요.", refused: true, item_ids: [] },
    { id: "20000000-0000-4000-8000-000000000135", question_key: "deadline", question: "언제까지 결정해야 하나요?", answer: "현재 기록에는 오늘 배포 여부를 결정해야 한다는 요청이 있습니다.", generic_answer: "요청자와 마감 시각을 합의해 기록하세요.", refused: false, item_ids: ["20000000-0000-4000-8000-000000000112"] },
    { id: "20000000-0000-4000-8000-000000000136", question_key: "principle", question: "우리 부서 원칙은 무엇인가요?", answer: "원인 분석보다 먼저 영향 범위와 롤백 가능 여부를 확인합니다.", generic_answer: "팀의 최신 원칙 문서를 확인하고 예외 조건을 기록하세요.", refused: false, item_ids: ["20000000-0000-4000-8000-000000000111"] },
  ],
};

const AGENT_ROLE_CRITERIA = [
  { key: "talent_fit", label: "인재상 부합", description: "영향 범위와 롤백 가능성을 먼저 확인하는 개발 원칙에 맞는 경험", weight: 3 },
  { key: "stack_usage", label: "프로젝트 스택 활용", description: "Next.js App Router와 Supabase RLS를 프로젝트에서 활용한 근거", weight: 4 },
  { key: "collaboration", label: "협업·문서화", description: "결정과 운영 맥락을 문서로 남기고 팀과 검토한 근거", weight: 2 },
] as const;

const roleCriteria = (values: Array<Omit<VerifiedCriterion, "key" | "label" | "weight">>): VerifiedCriterion[] =>
  values.map((value, index) => ({ ...AGENT_ROLE_CRITERIA[index], ...value }));

// 문서 어시스턴트가 읽는 계약(DocumentSummary) 전체 형태. 인용과 핵심 내용은 items 원문 그대로다.
const applicantSummary = (overview: string, points: Array<[itemId: string, text: string]>): DocumentSummary => ({
  citations: points.map(([item_id, quote]) => ({ item_id, decision_id: null, quote })),
  overview,
  key_points: points.map(([item_id, text]) => ({ item_id, text })),
  decisions: [],
  actions: [],
  open_questions: [],
});

const DEMO_AGENT_ROLE_SEED = {
  id: "20000000-0000-4000-8000-000000000151",
  dept_id: IDS.devDept,
  name: "백엔드 개발자 서류 검토 (합성)",
  instruction: "개발팀은 영향 범위와 롤백 가능성을 먼저 확인하는 사람을 중요하게 봅니다. Next.js App Router와 Supabase RLS를 실제 프로젝트에 활용한 경험을 확인합니다. 결정과 운영 맥락을 팀과 문서로 나누는 습관도 근거가 있을 때만 평가합니다.",
  visibility: "dept" as const,
  created_by: DEMO_DEV_LEAD_ID,
  criteria: AGENT_ROLE_CRITERIA,
  documents: [
    { source_id: "20000000-0000-4000-8000-000000000104", summary: applicantSummary("지원자 A는 사내 도구 구현과 운영 문서화 경험을 제시했습니다.", [
      ["20000000-0000-4000-8000-000000000141", "Next.js App Router와 Supabase RLS로 사내 승인 도구를 만들었습니다."],
      ["20000000-0000-4000-8000-000000000142", "결정 기록을 문서화하고 변경 이유를 팀과 함께 검토하는 습관이 있습니다."],
      ["20000000-0000-4000-8000-000000000143", "운영 중에는 영향 범위와 롤백 절차를 체크리스트로 남겼습니다."],
    ]) },
    { source_id: "20000000-0000-4000-8000-000000000105", summary: applicantSummary("지원자 B는 백엔드 운영 경험을 제시했지만 프로젝트 스택 근거는 없습니다.", [
      ["20000000-0000-4000-8000-000000000144", "여러 서비스의 API와 데이터 처리 작업을 맡아 백엔드 운영 경험을 쌓았습니다."],
      ["20000000-0000-4000-8000-000000000145", "운영 이슈의 원인과 대응 과정을 짧은 문서로 정리해 공유했습니다."],
    ]) },
    { source_id: "20000000-0000-4000-8000-000000000106", summary: applicantSummary("지원자 C는 프론트엔드 작업 경험을 제시했고 협업 문서화 근거는 없습니다.", [
      ["20000000-0000-4000-8000-000000000146", "사용자 화면의 컴포넌트 구조와 인터랙션을 개선하는 프론트엔드 작업을 주로 했습니다."],
      ["20000000-0000-4000-8000-000000000147", "시각적 완성도와 사용 흐름을 다듬는 데 집중했습니다."],
    ]) },
  ],
  results: [
    {
      id: "20000000-0000-4000-8000-000000000161",
      source_id: "20000000-0000-4000-8000-000000000104",
      result: {
        criteria: roleCriteria([
          { score: 5, rationale: "운영 원칙과 맞는 사내 도구·체크리스트 경험이 확인됩니다.", citations: [{ item_id: "20000000-0000-4000-8000-000000000143", decision_id: null, quote: "영향 범위와 롤백 절차를 체크리스트로 남겼습니다." }], evidence: "ok" },
          { score: 5, rationale: "프로젝트 스택을 실제 사내 도구에 활용한 근거가 있습니다.", citations: [{ item_id: "20000000-0000-4000-8000-000000000141", decision_id: null, quote: "Next.js App Router와 Supabase RLS로 사내 승인 도구를 만들었습니다." }], evidence: "ok" },
          { score: 5, rationale: "결정 이유를 문서화하고 팀과 검토한 근거가 있습니다.", citations: [{ item_id: "20000000-0000-4000-8000-000000000142", decision_id: null, quote: "결정 기록을 문서화하고 변경 이유를 팀과 함께 검토하는 습관이 있습니다." }], evidence: "ok" },
        ]),
        summary: "사내 도구 구현, 운영 체크리스트, 결정 기록 문서화의 근거가 모두 확인됩니다.",
      },
    },
    {
      id: "20000000-0000-4000-8000-000000000162",
      source_id: "20000000-0000-4000-8000-000000000105",
      result: {
        criteria: roleCriteria([
          { score: 3, rationale: "백엔드 운영 경험은 확인되지만 개발 원칙의 직접 근거는 제한적입니다.", citations: [{ item_id: "20000000-0000-4000-8000-000000000144", decision_id: null, quote: "여러 서비스의 API와 데이터 처리 작업을 맡아 백엔드 운영 경험을 쌓았습니다." }], evidence: "ok" },
          { score: null, rationale: null, citations: [], evidence: "no_evidence" },
          { score: 3, rationale: "운영 이슈의 대응 과정을 문서로 공유한 근거가 있습니다.", citations: [{ item_id: "20000000-0000-4000-8000-000000000145", decision_id: null, quote: "운영 이슈의 원인과 대응 과정을 짧은 문서로 정리해 공유했습니다." }], evidence: "ok" },
        ]),
        summary: "백엔드 운영과 문서화 근거는 있으나 프로젝트 스택 활용 근거는 제시되지 않았습니다.",
      },
    },
    {
      id: "20000000-0000-4000-8000-000000000163",
      source_id: "20000000-0000-4000-8000-000000000106",
      result: {
        criteria: roleCriteria([
          { score: 2, rationale: "프론트엔드 중심 경험은 확인되지만 백엔드 역할과 직접 맞닿은 근거는 제한적입니다.", citations: [{ item_id: "20000000-0000-4000-8000-000000000146", decision_id: null, quote: "사용자 화면의 컴포넌트 구조와 인터랙션을 개선하는 프론트엔드 작업을 주로 했습니다." }], evidence: "ok" },
          { score: null, rationale: null, citations: [], evidence: "no_evidence" },
          { score: null, rationale: null, citations: [], evidence: "no_evidence" },
        ]),
        summary: "프론트엔드 작업 근거는 있으나 프로젝트 스택과 협업·문서화 근거는 제시되지 않았습니다.",
      },
    },
  ],
} as const;

export const DEMO_AGENT_ROLE = {
  ...DEMO_AGENT_ROLE_SEED,
  results: DEMO_AGENT_ROLE_SEED.results.map((result) => ({
    ...result,
    weighted_score: weightedScore(result.result.criteria.map((criterion) => ({ ...criterion }))),
  })),
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
    { id: planningItemId(131), question_key: "planning-vendor", question: "QA 업체 B를 선택한 이유는 무엇인가요?", answer: "기록상 업체 B는 1,780만원으로 예산 상한 2,000만원 안에 있고, 9월 18일 투입과 야간 테스트를 함께 충족합니다.", generic_answer: "업체별 일정·범위·비용을 비교하고 최종 승인자를 확인하세요.", refused: false, item_ids: [planningItemId(44)] },
    { id: planningItemId(132), question_key: "planning-deadline", question: "외주 QA 결정은 언제까지인가요?", answer: "김현우 팀장이 금요일 17시까지 결정이 필요하다고 남겼습니다.", generic_answer: "요청자와 결정 마감 시각을 합의해 기록하세요.", refused: false, item_ids: [planningItemId(5)] },
    { id: planningItemId(133), question_key: "planning-budget", question: "예산안에서 남는 금액은 어떻게 하나요?", answer: "런칭 예산안.xlsx와 과장 발언에 따르면 220만원을 장애 대응 예비비로 남기고 추가 집행은 팀장 승인으로 제한합니다.", generic_answer: "예산 상한과 예비비 사용 조건을 함께 확인하세요.", refused: false, item_ids: [planningItemId(102)] },
    { id: planningItemId(134), question_key: "planning-notice", question: "고객 공지는 언제 발송하나요?", answer: "기록에는 수요일 오전 10시 발송 일정이 있고, 베타 오픈 기준은 최종 공지와 QA 통과 확인입니다.", generic_answer: "공지 대상·발송 시각·최종 승인자를 확인하세요.", refused: false, item_ids: [planningItemId(51)] },
    { id: planningItemId(135), question_key: "planning-owner", question: "실무 자료와 테스트 케이스는 누가 맡았나요?", answer: "최민지 사원이 자료와 테스트 케이스를 맡고, 이준호 대리가 업체 커뮤니케이션과 실무 조율을 맡았습니다.", generic_answer: "업무별 담당자와 검토자를 분리해 기록하세요.", refused: false, item_ids: [planningItemId(29)] },
    { id: planningItemId(136), question_key: "planning-principle", question: "기획팀의 예산 원칙은 무엇인가요?", answer: "예산 상한을 넘는 집행은 팀장 승인을 받고, 일정 변경보다 고객 공지 가능성을 먼저 확인합니다.", generic_answer: "최신 부서 원칙 문서를 먼저 확인하세요.", refused: false, item_ids: [planningItemId(101)] },
  ],
};

const DESIGN_SOURCE_IDS = {
  principles: "40000000-0000-4000-8000-000000000101",
  slack: "40000000-0000-4000-8000-000000000102",
  meeting: "40000000-0000-4000-8000-000000000103",
  brand: "40000000-0000-4000-8000-000000000104",
} as const;

const designItemId = (number: number): string =>
  `40000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

const DESIGN_DIALOGUE: Array<[author: string, label: "decision" | "action" | "info" | "chatter", content: string]> = [
  ["윤아 디자이너", "info", "디자인 원칙은 주요 터치 영역을 최소 48px로 만들고, 색상만으로 상태를 구분하지 않는 것입니다."],
  ["현 디자이너", "info", "신규 화면 시안은 44px 아이콘 버튼을 사용하고 있어 접근성 검토가 필요합니다."],
  ["도하 리드", "decision", "출시 일정에 맞춰 44px 버튼 시안을 승인할까요? 오늘 16시까지 결정이 필요합니다."],
  ["윤아 디자이너", "action", "48px 대안 시안과 작은 화면 비교 이미지를 오후 2시까지 올리겠습니다."],
  ["현 디자이너", "info", "브랜드 가이드는 좁은 카드에서는 로고 여백을 줄일 수 있지만, 최소 터치 영역 예외는 승인 기록이 필요하다고 적고 있습니다."],
  ["도하 리드", "decision", "접근성 기준을 유지하고 출시용 시안은 48px 버튼으로 교체하겠습니다."],
  ["윤아 디자이너", "info", "외주 일러스트 스튜디오는 캐릭터 12종을 다음 주 월요일까지 납품할 수 있다고 답했습니다."],
  ["현 디자이너", "decision", "외주 일러스트 계약을 이번 주에 진행할까요? 수정 2회와 원본 파일 전달 조건을 넣어야 합니다."],
  ["도하 리드", "action", "계약서에 원본 파일과 수정 횟수 조건을 반영해 검토 요청을 올리겠습니다."],
  ["윤아 디자이너", "info", "출시 범위를 맞추려면 온보딩 일러스트 4종은 이번 릴리스에서 제외할 수 있습니다."],
  ["현 디자이너", "decision", "출시 일정을 지키기 위해 온보딩 일러스트 4종을 이번 시안 컷에서 제외할까요?"],
  ["도하 리드", "info", "브랜드 가이드 예외는 고객 노출 화면에서만 승인자와 근거를 남기면 됩니다."],
  ["윤아 디자이너", "action", "Figma 파일에 접근성 점검표와 예외 승인 영역을 추가했습니다."],
  ["현 디자이너", "chatter", "오늘 디자인 리뷰는 회의실 B에서 할게요."],
  ["도하 리드", "info", "외주 일러스트 견적은 수정 2회와 원본 파일 포함 조건에서 예산 범위 안입니다."],
  ["윤아 디자이너", "action", "계약 후보의 납기와 저작권 이전 조건을 표로 정리하겠습니다."],
  ["현 디자이너", "info", "48px 버튼 시안은 기존 레이아웃에서도 한 줄 줄바꿈 없이 적용됩니다."],
  ["도하 리드", "decision", "48px 접근성 기준을 유지한 시안으로 출시하고, 브랜드 여백 예외는 적용하지 않겠습니다."],
  ["윤아 디자이너", "info", "회의에서 온보딩 일러스트 4종은 다음 릴리스로 미루기로 보류했습니다."],
  ["현 디자이너", "action", "제외한 일러스트 목록과 다음 릴리스 후보를 Figma 전달 문서에 표시하겠습니다."],
  ["도하 리드", "chatter", "점심 전에 시안 코멘트만 정리해 주세요."],
  ["윤아 디자이너", "info", "외주 계약 초안에 수정 2회, 원본 파일, 저작권 이전 조건이 모두 들어갔습니다."],
];

const DESIGN: DemoDepartment = {
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  name: "디자인팀 사수",
  sources: [
    { id: DESIGN_SOURCE_IDS.principles, kind: "notion_page", external_id: "demo-design-principles", title: "디자인팀 원칙 문서", visibility: "dept", is_principles: true },
    { id: DESIGN_SOURCE_IDS.slack, kind: "slack_channel", external_id: "demo-design-channel", title: "#디자인-결정", visibility: "dept", is_principles: false },
    { id: DESIGN_SOURCE_IDS.meeting, kind: "meeting", external_id: "demo-design-meeting", title: "주간 디자인 리뷰", visibility: "leads_only", is_principles: false },
    { id: DESIGN_SOURCE_IDS.brand, kind: "document", external_id: "demo-design-brand-guide", title: "브랜드 가이드 예외 기준", visibility: "dept", is_principles: false },
  ],
  items: [
    ...DESIGN_DIALOGUE.map(([author, label, content], index) => ({
      id: designItemId(index + 1),
      source_id: index < 18 ? DESIGN_SOURCE_IDS.slack : DESIGN_SOURCE_IDS.meeting,
      external_ref: index < 18 ? `design-slack-${index + 1}` : `design-meeting-${index + 1}`,
      author,
      content,
      label,
    })),
    { id: designItemId(101), source_id: DESIGN_SOURCE_IDS.principles, external_ref: "design-principle-1", author: "디자인팀 원칙", content: "주요 터치 영역은 최소 48px로 만들고, 브랜드 가이드 예외는 승인자와 근거를 기록합니다.", label: "info" },
    { id: designItemId(102), source_id: DESIGN_SOURCE_IDS.brand, external_ref: "design-brand-1", author: "브랜드 가이드 예외 기준", content: "출시 일정으로 시안을 줄일 때에도 접근성 기준은 낮추지 않고, 제외 범위와 다음 릴리스 계획을 남깁니다.", label: "info" },
  ],
  request: { id: designItemId(121), origin_item_id: designItemId(3), citation_item_ids: [designItemId(3), designItemId(19)], title: "출시 시안의 48px 접근성 기준을 유지할까요?", background: "슬랙의 44px 버튼 승인 요청과 회의의 출시 보류 안건이 같은 접근성 결정으로 모였습니다.", recommendation: "출시 일정과 무관하게 48px 기준을 유지하고 시안을 교체하는 방향을 권합니다.", visibility: "leads_only" },
  extraRequests: [
    { id: designItemId(123), origin_item_id: designItemId(8), citation_item_ids: [designItemId(8), designItemId(22)], title: "외주 일러스트 계약을 진행할까요?", background: "외주 일러스트 납기와 수정·원본 파일 조건을 확인해 계약 결정을 요청했습니다.", recommendation: "수정 2회와 원본 파일·저작권 이전 조건을 계약서에 남긴 뒤 진행합니다.", visibility: "dept" },
  ],
  priorDecision: { id: designItemId(122), outcome: "48px 접근성 기준으로 출시", rationale: "출시 일정이 있어도 최소 터치 영역 기준은 낮추지 않기로 했습니다.", item_id: designItemId(18) },
  extraPriorDecisions: [
    { id: designItemId(124), outcome: "온보딩 일러스트 4종을 다음 릴리스로 이관", rationale: "핵심 출시 범위를 지키되 제외 범위와 다음 계획을 기록했습니다.", item_id: designItemId(19) },
    { id: designItemId(125), outcome: "외주 일러스트 계약 조건 승인", rationale: "수정 2회와 원본 파일 전달 조건을 포함해 계약하기로 했습니다.", item_id: designItemId(22) },
  ],
  answers: [
    { id: designItemId(131), question_key: "design-accessibility-lead", question: "팀장이 보는 출시 시안의 접근성 기준은 무엇인가요?", answer: "주요 터치 영역은 최소 48px로 만들고, 44px 승인 요청은 회의에서 보류한 뒤 48px 시안으로 출시하기로 했습니다.", generic_answer: "접근성 가이드와 출시 일정 영향을 함께 확인하세요.", refused: false, item_ids: [designItemId(18)] },
    { id: designItemId(132), question_key: "design-accessibility-member", question: "팀원이 보는 출시 시안의 접근성 기준은 무엇인가요?", answer: "주요 터치 영역은 최소 48px로 만들고, 접근성 기준은 출시 일정 때문에 낮추지 않습니다.", generic_answer: "접근성 가이드와 출시 일정 영향을 함께 확인하세요.", refused: false, item_ids: [designItemId(101)] },
    { id: designItemId(133), question_key: "design-brand", question: "브랜드 가이드 예외는 어떻게 처리하나요?", answer: "브랜드 가이드 예외는 승인자와 근거를 기록하며, 접근성 기준 자체는 예외로 낮추지 않습니다.", generic_answer: "브랜드 가이드와 승인 절차를 확인하세요.", refused: false, item_ids: [designItemId(101)] },
    { id: designItemId(134), question_key: "design-cut", question: "출시에서 제외한 시안은 무엇인가요?", answer: "온보딩 일러스트 4종은 출시 일정을 지키기 위해 다음 릴리스로 이관했습니다.", generic_answer: "출시 우선순위와 다음 일정을 확인하세요.", refused: false, item_ids: [designItemId(19)] },
    { id: designItemId(135), question_key: "design-vendor", question: "외주 일러스트 계약 조건은 무엇인가요?", answer: "외주 계약은 수정 2회와 원본 파일·저작권 이전 조건을 포함해 진행합니다.", generic_answer: "납기와 저작권 조건을 계약서에 명시하세요.", refused: false, item_ids: [designItemId(22)] },
    { id: designItemId(136), question_key: "design-figma", question: "Figma 전달 전에 무엇을 확인하나요?", answer: "Figma 파일에는 접근성 점검표와 예외 승인 영역을 함께 기록합니다.", generic_answer: "검토 기준과 승인 이력을 파일에 남기세요.", refused: false, item_ids: [designItemId(13)] },
  ],
};

function hiringDepartment(mission: (typeof hiringMissions)[number], prefix: string): DemoDepartment {
  const id = (number: number) => `${prefix}-0000-4000-8000-${String(number).padStart(12, "0")}`;
  const sources: DemoDepartment["sources"] = [
    { id: id(101), kind: "notion_page", external_id: `demo-${mission.id}-principles`, title: `${mission.team} 원칙 문서`, visibility: "dept", is_principles: true },
    { id: id(102), kind: "slack_channel", external_id: `demo-${mission.id}-channel`, title: `#${mission.team}-결정`, visibility: "dept", is_principles: false },
    { id: id(103), kind: "meeting", external_id: `demo-${mission.id}-meeting`, title: `${mission.team} 합성 과제 리뷰`, visibility: "leads_only", is_principles: false },
    { id: id(104), kind: "document", external_id: `demo-${mission.id}-assignment`, title: `${mission.role} 합성 미션`, visibility: "dept", is_principles: false },
  ];
  const items: DemoDepartment["items"] = [
    ...mission.facts.map((fact, index) => ({ id: id(111 + index), source_id: id(101), external_ref: fact.id, author: `${mission.team} 원칙`, content: fact.text, label: "info" as const })),
    ...mission.stages.flatMap((stage, index) => [
      { id: id(120 + index * 4), source_id: id(102), external_ref: `${stage.id}-request`, author: "합성 신입", content: `${stage.label}에서 결정이 필요합니다. ${stage.prompt}`, label: "decision" as const },
      { id: id(121 + index * 4), source_id: id(102), external_ref: `${stage.id}-criteria`, author: "합성 동료", content: `${mission.deliverables[index]}를 준비하고 ${mission.criteria[index]}를 확인하겠습니다.`, label: "action" as const },
      { id: id(122 + index * 4), source_id: id(103), external_ref: `${stage.id}-review`, author: "합성 리드", content: `${stage.label} 검토에서는 ${mission.criteria[index]}를 확인하고, 근거 없는 결론은 보류합니다.`, label: "decision" as const },
      { id: id(123 + index * 4), source_id: id(102), external_ref: `${stage.id}-followup`, author: "합성 동료", content: `${mission.deliverables[index]}의 누락 항목은 다음 검토에 남기고 담당자에게 확인하겠습니다.`, label: "action" as const },
    ]),
    { id: id(140), source_id: id(104), external_ref: `${mission.id}-assignment`, author: `${mission.team} 과제 안내`, content: `${mission.title}\n${mission.brief}\n${mission.sample.approach}`, label: "info" },
  ];
  return {
    id: mission.deptId, name: `${mission.team} 사수`, sources, items,
    request: { id: id(201), origin_item_id: id(120), citation_item_ids: [id(120), id(122)], title: `${mission.title}: 첫 검토 기준을 확정할까요?`, background: items.find(item => item.id === id(120))!.content, recommendation: items.find(item => item.id === id(122))!.content, visibility: "leads_only" },
    extraRequests: [{ id: id(202), origin_item_id: id(124), citation_item_ids: [id(124), id(125)], title: `${mission.stages[1].label}의 산출물을 준비할까요?`, background: items.find(item => item.id === id(124))!.content, recommendation: items.find(item => item.id === id(125))!.content, visibility: "dept" }],
    priorDecision: { id: id(211), outcome: `${mission.criteria[0]}를 확인한 뒤 진행`, rationale: items.find(item => item.id === id(122))!.content, item_id: id(122) },
    answers: [
      ...mission.facts.map((fact, index) => ({ id: id(301 + index), question_key: fact.id, question: `${fact.label}에서 확인할 내용은 무엇인가요?`, answer: fact.text, generic_answer: "팀의 최신 원칙과 관련 근거를 확인하세요.", refused: false, item_ids: [id(111 + index)] })),
      { id: id(304), question_key: `${mission.id}-mission`, question: "신입 미션은 무엇인가요?", answer: `${mission.title}\n${mission.brief}`, generic_answer: "담당자에게 직무 과제와 제출 기준을 확인하세요.", refused: false, item_ids: [id(140)] },
      { id: id(305), question_key: `${mission.id}-review`, question: "리드가 확인한 첫 검토 기준은 무엇인가요?", answer: items.find(item => item.id === id(122))!.content, generic_answer: "검토 기준과 승인 근거를 확인하세요.", refused: false, item_ids: [id(122)] },
      { id: id(306), question_key: `${mission.id}-missing`, question: "이 지원자의 최종 합격 여부는 무엇인가요?", answer: "합성 체험에는 실제 지원자 합불 결정 근거가 없습니다.", generic_answer: "최종 채용 판단은 담당자가 근거를 확인해야 합니다.", refused: true, item_ids: [] },
    ],
  };
}
const HIRING_DEPARTMENTS = hiringMissions.filter(mission => ["hr", "frontend", "backend"].includes(mission.id)).map((mission, index) => hiringDepartment(mission, `${index + 5}0000000`));
export const DEMO_DEPARTMENTS = [SALES, DEVELOPMENT, PLANNING, DESIGN, ...HIRING_DEPARTMENTS];

export const DEMO_RETENTION_SETTINGS = DEMO_DEPARTMENTS.map((department) => ({
  dept_id: department.id,
  plan: "paid" as const,
  expires_at: "2027-09-30",
  retention_days: 365 as const,
  checked_at: "2026-09-17T00:00:00.000Z",
  checked_by: DEMO_REVIEWER_ID,
}));

export const DEMO_RETENTION_EXPORTS = DEMO_DEPARTMENTS.map((department) => {
  const source = department.sources.find((candidate) => candidate.kind === "slack_channel");
  if (!source) throw new Error("demo Slack source required");
  return {
    dept_id: department.id,
    source_id: source.id,
    created_by: DEMO_REVIEWER_ID,
    range_from: "2026-09-01T00:00:00.000Z",
    range_to: "2026-09-17T00:00:00.000Z",
    record_count: department.items.filter((item) => item.source_id === source.id).length,
    checksum: department.id[0].repeat(64),
    created_at: "2026-09-17T00:00:00.000Z",
  };
});

const DEMO_MEMBER_NAMES = [
  ["김서윤", "이도현", "박하린"], ["개발팀 리드", "정지우", "최민준"],
  ["한지민", "윤서준", "강수빈"], ["오예린", "장도윤", "임서아"],
  ["인사팀 합성 리드", "인사팀 합성 동료", "인사팀 미동의 멤버"],
  ["프론트 합성 리드", "프론트 합성 동료", "프론트 미동의 멤버"],
  ["백엔드 합성 리드", "백엔드 합성 동료", "백엔드 미동의 멤버"],
];
const DEPARTMENT_MEMBERS = DEMO_DEPARTMENTS.flatMap((department, deptIndex) =>
  DEMO_MEMBER_NAMES[deptIndex].map((name, memberIndex) => {
    const userId = `${department.id.slice(0, -2)}0${memberIndex + 1}`;
    return { user_id: userId, dept_id: department.id, email: `${userId}@demo.invalid`, display_name: name, role: memberIndex === 0 ? "lead" as const : "member" as const, consented: memberIndex !== 2, slack_user_id: memberIndex === 0 ? `demo-${department.id.slice(0, 4)}` : null };
  }),
);

export const DEMO_MEMBERS = [
  ...DEPARTMENT_MEMBERS,
  ...DEMO_DEPARTMENTS.map((department) => ({
    user_id: DEMO_REVIEWER_ID,
    dept_id: department.id,
    email: demoReviewerEmail(),
    display_name: "심사위원 데모",
    role: "lead" as const,
    consented: true,
    slack_user_id: null,
  })),
];

function uniqueDemoUsers() {
  return [...new Map(DEMO_MEMBERS.map((member) => [member.user_id, member])).values()];
}

async function removeExistingDemoData(
  client: ReturnType<typeof createServiceSupabaseClient>,
): Promise<void> {
  const org = await client.from("orgs").select("is_demo").eq("id", IDS.org).maybeSingle();
  if (org.error || (org.data && !org.data.is_demo)) throw new Error("demo org identity check failed");
  const events = await client.from("admin_events").select("id", { count: "exact", head: true }).eq("org_id", IDS.org);
  if (events.error) throw new Error("demo admin event check failed; apply 0026 before seeding");
  if (events.count) throw new Error("demo admin events exist; append-only records prevent reseeding");
  const departmentIds = DEMO_DEPARTMENTS.map((department) => department.id);
  for (const table of ["retro_days", "trailer_attempts", "trailers", "trailer_generation_counters"] as const) {
    const result = await client.from(table).delete().in("dept_id", departmentIds);
    if (result.error && !["42P01", "PGRST205"].includes(result.error.code)) throw new Error(`demo cleanup failed: ${table}`);
  }
  const citationOwnerIds = DEMO_DEPARTMENTS.flatMap((department) => [
    department.request.id,
    ...(department.extraRequests ?? []).map((request) => request.id),
    department.priorDecision.id,
    ...(department.extraPriorDecisions ?? []).map((decision) => decision.id),
    ...department.answers.map((answer) => answer.id),
  ]);
  const conflictRequestIds = DEMO_DEPARTMENTS.flatMap((department) => [
    department.request.id,
    ...(department.extraRequests ?? []).map((request) => request.id),
  ]);
  const itemIds = DEMO_DEPARTMENTS.flatMap((department) => department.items.map((item) => item.id));
  const { error: roleResultError } = await client.from("agent_role_results").delete().in("dept_id", departmentIds);
  if (roleResultError) throw new Error("demo agent role result cleanup failed");
  const { error: roleError } = await client.from("agent_roles").delete().in("dept_id", departmentIds);
  if (roleError) throw new Error("demo agent role cleanup failed");
  const { error: documentSummaryError } = await client.from("document_summaries").delete().in("dept_id", departmentIds);
  if (documentSummaryError) throw new Error("demo document summary cleanup failed");
  const { error: retentionExportError } = await client.from("retention_exports").delete().in("dept_id", departmentIds);
  if (retentionExportError) throw new Error("demo retention export cleanup failed");
  const { error: retentionSettingsError } = await client.from("retention_settings").delete().in("dept_id", departmentIds);
  if (retentionSettingsError) throw new Error("demo retention settings cleanup failed");
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
  const { error: exclusionError } = await client.from("notion_exclusions").delete().in("dept_id", departmentIds);
  if (exclusionError) throw new Error("demo Notion exclusion cleanup failed");
  const { error: rootError } = await client.from("notion_roots").delete().eq("org_id", IDS.org);
  if (rootError) throw new Error("demo Notion root cleanup failed");
  for (const table of ["member_invites", "org_admins"] as const) {
    const { error } = await client.from(table).delete().eq("org_id", IDS.org);
    if (error) throw new Error(`demo cleanup failed: ${table}`);
  }
  const { error: departmentError } = await client.from("departments").delete().in("id", departmentIds);
  if (departmentError) throw new Error("demo department cleanup failed");
  const { error: orgError } = await client.from("orgs").delete().eq("id", IDS.org);
  if (orgError) throw new Error("demo org cleanup failed");
  for (const member of uniqueDemoUsers()) {
    const existing = await client.auth.admin.getUserById(member.user_id);
    if (existing.error?.status === 404) continue;
    if (existing.error || !existing.data.user || existing.data.user.email !== member.email) throw new Error("demo user identity check failed");
    const result = await client.auth.admin.deleteUser(member.user_id);
    if (result.error) throw new Error("demo user cleanup failed");
  }
}

async function seedDemoUsers(client: ReturnType<typeof createServiceSupabaseClient>): Promise<void> {
  const reviewerPassword = process.env.SASU_DEMO_USER_PASSWORD?.trim();
  if (demoAutoLoginEnabled() && !reviewerPassword) {
    throw new Error("SASU_DEMO_USER_PASSWORD is required when demo auto login is enabled");
  }
  for (const member of uniqueDemoUsers()) {
    const { error } = await client.auth.admin.createUser({
      id: member.user_id,
      email: member.email,
      email_confirm: true,
      user_metadata: { display_name: member.display_name },
      ...(member.user_id === DEMO_REVIEWER_ID && reviewerPassword
        ? { password: reviewerPassword }
        : {}),
    });
    if (error) throw new Error("demo user seed failed");
  }
}

async function seedDemoReviewerAdmin(
  client: ReturnType<typeof createServiceSupabaseClient>,
): Promise<void> {
  const { error } = await client.from("org_admins").insert({
    org_id: IDS.org,
    user_id: DEMO_REVIEWER_ID,
    granted_by: "script:seed-demo",
  });
  if (error) throw new Error("demo reviewer admin seed failed");
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

  const root = DEMO_NOTION_ROOTS.find((candidate) => candidate.dept_id === department.id);
  if (root) {
    const { error: rootError } = await client.from("notion_roots").insert({
      id: root.id,
      org_id: root.org_id,
      dept_id: root.dept_id,
      scope: root.scope,
      notion_id: root.notion_id,
      notion_kind: root.notion_kind,
      top_title: root.top_title,
      visibility: root.visibility,
      include_new: root.include_new,
      card_candidates: root.card_candidates,
      created_role: root.created_role,
      state: root.state,
      created_by: DEMO_REVIEWER_ID,
    });
    if (rootError) throw new Error("demo Notion root seed failed");
  }

  const { error: sourceError } = await client.from("sources").insert(
    department.sources.map((source) => ({ dept_id: department.id, ...source, active: source.active ?? true })),
    { defaultToNull: false },
  );
  if (sourceError) throw new Error(`demo source seed failed: ${sourceError.code}`);

  const exclusions = DEMO_NOTION_EXCLUSIONS.filter((entry) => entry.dept_id === department.id);
  if (exclusions.length > 0) {
    const { error: exclusionError } = await client.from("notion_exclusions").insert(
      exclusions.map((entry) => ({ ...entry, created_by: DEMO_REVIEWER_ID })),
    );
    if (exclusionError) throw new Error("demo Notion exclusion seed failed");
  }

  const { error: memberError } = await client.from("members").insert(
    DEMO_MEMBERS.filter((member) => member.dept_id === department.id).map((member) => ({
      user_id: member.user_id, dept_id: member.dept_id, role: member.role, display_name: member.display_name,
      consented_at: member.consented ? new Date().toISOString() : null, consent_version: member.consented ? 1 : null,
      slack_user_id: member.slack_user_id,
    })),
  );
  if (memberError) throw new Error("demo membership seed failed");

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

  if (department.id === IDS.devDept) {
    const { error: documentSummaryError } = await client.from("document_summaries").insert(
      DEMO_AGENT_ROLE.documents.map((document) => ({
        source_id: document.source_id,
        dept_id: department.id,
        status: "summarized",
        summary: document.summary,
        extracted_chars: department.items.filter((item) => item.source_id === document.source_id).reduce((total, item) => total + item.content.length, 0),
        chunk_count: department.items.filter((item) => item.source_id === document.source_id).length,
      })),
    );
    if (documentSummaryError) throw new Error("demo document summary seed failed");
  }

  const requests = [department.request, ...(department.extraRequests ?? [])];
  const { error: requestError } = await client.from("decision_requests").insert(
    requests.map((request) => ({
      id: request.id,
      dept_id: department.id,
      title: request.title,
      background: request.background,
      recommendation: request.recommendation,
      visibility: request.visibility,
      status: "open",
      origin_item_id: request.origin_item_id,
    })),
  );
  if (requestError) throw new Error("demo request seed failed");

  const priorDecisions = [department.priorDecision, ...(department.extraPriorDecisions ?? [])];
  const { error: decisionError } = await client.from("decisions").insert(
    priorDecisions.map((decision) => ({
      id: decision.id,
      dept_id: department.id,
      decided_by_name: `${department.name} 리드`,
      outcome: decision.outcome,
      rationale: decision.rationale,
      lead_time_min: 42,
    })),
  );
  if (decisionError) throw new Error("demo decision seed failed");

  const requestCitations = requests.flatMap((request) => request.citation_item_ids.map((itemId) => {
    const item = department.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("demo request citation seed failed");
    return { owner_kind: "decision_request", owner_id: request.id, item_id: item.id, quote: item.content };
  }));
  const { error: requestCitationError } = await client.from("citations").insert(requestCitations);
  if (requestCitationError) throw new Error("demo request citation seed failed");

  const decisionCitations = priorDecisions.map((decision) => {
    const item = department.items.find((candidate) => candidate.id === decision.item_id);
    if (!item) throw new Error("demo decision citation seed failed");
    return { owner_kind: "decision", owner_id: decision.id, item_id: item.id, quote: item.content };
  });
  const { error: decisionCitationError } = await client.from("citations").insert(decisionCitations);
  if (decisionCitationError) throw new Error("demo decision citation seed failed");

  const { error: conflictError } = await client.from("conflicts").insert({
    request_id: department.request.id,
    prior_decision_id: department.priorDecision.id,
    explanation: department.conflict_explanation ?? "과거 결정의 근거와 이번 안건을 함께 확인해야 합니다.",
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
      status: answer.refused ? "refused" : "done",
      refused: answer.refused,
      verified: true,
    })),
  );
  if (answerError) throw new Error("demo answer seed failed");

  const answerCitations = department.answers.flatMap((answer) =>
    answer.item_ids.map((itemId) => {
      const item = department.items.find((candidate) => candidate.id === itemId);
      if (!item) throw new Error("demo answer citation seed failed");
      return { owner_kind: "answer", owner_id: answer.id, item_id: item.id, quote: item.content };
    }),
  );
  if (answerCitations.length > 0) {
    const { error: answerCitationError } = await client.from("citations").insert(answerCitations);
    if (answerCitationError) throw new Error("demo answer citation seed failed");
  }
}

async function seedDemoAgentRole(client: ReturnType<typeof createServiceSupabaseClient>): Promise<void> {
  const { error: roleError } = await client.from("agent_roles").insert({
    id: DEMO_AGENT_ROLE.id,
    dept_id: DEMO_AGENT_ROLE.dept_id,
    name: DEMO_AGENT_ROLE.name,
    instruction: DEMO_AGENT_ROLE.instruction,
    criteria: DEMO_AGENT_ROLE.criteria,
    visibility: DEMO_AGENT_ROLE.visibility,
    created_by: DEMO_AGENT_ROLE.created_by,
  });
  if (roleError) throw new Error("demo agent role seed failed");

  const { error: resultError } = await client.from("agent_role_results").insert(
    DEMO_AGENT_ROLE.results.map((result) => ({
      id: result.id,
      role_id: DEMO_AGENT_ROLE.id,
      source_id: result.source_id,
      dept_id: DEMO_AGENT_ROLE.dept_id,
      visibility: DEMO_AGENT_ROLE.visibility,
      status: "completed",
      result: result.result,
      weighted_score: result.weighted_score,
      requested_by: DEMO_AGENT_ROLE.created_by,
    })),
  );
  if (resultError) throw new Error("demo agent role result seed failed");
}

export async function seedDemoTrailer(client: ReturnType<typeof createServiceSupabaseClient>, path = "fixtures/trailer/demo-trailer.snapshot.json"): Promise<boolean> {
  let raw: unknown;
  try { raw = JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error && typeof error === "object" && Reflect.get(error, "code") === "ENOENT") { console.log("데모 예고편 스냅샷 없음 — 건너뜀"); return false; } throw new Error("demo snapshot read failed"); }
  const department = DEVELOPMENT;
  const decisions = [department.priorDecision, ...(department.extraPriorDecisions ?? [])];
  const sourceIds = department.sources.filter((source) => source.is_principles && source.visibility === "dept").map((source) => source.id);
  const texts = [...decisions.flatMap((d) => [d.outcome, d.rationale]), ...department.items.filter((item) => sourceIds.includes(item.source_id)).map((item) => item.content), ...[department.request, ...(department.extraRequests ?? [])].map((r) => r.title)];
  const parsed = parseDemoTrailerSnapshot(raw, { sourceTexts: texts.flatMap((text) => [text, mask(text)]), properNouns: ["온새미로 주식회사", department.name, ...DEMO_MEMBERS.filter((m) => m.dept_id === department.id).map((m) => m.display_name), ...department.sources.map((s) => s.title)], knownDecisionIds: decisions.map((d) => d.id) });
  if (parsed.status !== "ok") throw new Error(`demo snapshot invalid: ${parsed.reason}`);
  if (parsed.snapshot.dept_id !== DEMO_TRAILER_DEPT_ID) throw new Error("demo snapshot department mismatch");
  const org = await client.from("orgs").update({ trailer_publish_enabled: true }).eq("id", IDS.org).eq("is_demo", true).select("id").single();
  if (org.error) throw new Error("demo trailer org failed");
  const { scenarios, decision_ids, gate_report } = parsed.snapshot;
  const inserted = await client.from("trailers").insert({ id: DEMO_TRAILER_ID, dept_id: department.id, status: "review", source_decision_ids: decision_ids, scenarios, rubric: DEFAULT_TRAILER_RUBRIC, created_by: DEMO_DEV_LEAD_ID }).select("scenarios_hash").single();
  if (inserted.error || !inserted.data.scenarios_hash) throw new Error("demo trailer insert failed");
  const published = await client.from("trailers").update({ gate_report, gate_passed_hash: inserted.data.scenarios_hash, approved_item_ids: trailerApprovalItems(scenarios).map((item) => item.id), approval_hash: inserted.data.scenarios_hash, approved_by: DEMO_DEV_LEAD_ID, approved_at: new Date().toISOString(), status: "published", published_at: new Date().toISOString(), slug: DEMO_TRAILER_SLUG }).eq("id", DEMO_TRAILER_ID);
  if (published.error) throw new Error("demo trailer publish failed");
  return true;
}

async function seedDemoRetentionSettings(
  client: ReturnType<typeof createServiceSupabaseClient>,
): Promise<void> {
  const { error } = await client.from("retention_settings").insert(DEMO_RETENTION_SETTINGS);
  if (error) throw new Error("demo retention settings seed failed");
  const { error: exportError } = await client.from("retention_exports").insert(DEMO_RETENTION_EXPORTS);
  if (exportError) throw new Error("demo retention export seed failed");
}

export async function seedDemoAttempts(client: ReturnType<typeof createServiceSupabaseClient>, path = "fixtures/trailer/demo-attempts.snapshot.json"): Promise<void> {
  let raw: unknown;
  try { raw = JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error && typeof error === "object" && Reflect.get(error, "code") === "ENOENT") { console.log("데모 채점 스냅샷 없음 — 건너뜀"); return; } throw new Error("demo attempts snapshot read failed"); }
  const trailer = await client.from("trailers").select("scenarios,rubric,status").eq("id", DEMO_TRAILER_ID).maybeSingle();
  if (trailer.error || !trailer.data || trailer.data.status !== "published") throw new Error("demo trailer required");
  const parsed = parseDemoAttemptsSnapshot(raw, { trailerId: DEMO_TRAILER_ID, scenarios: trailer.data.scenarios, rubric: trailer.data.rubric });
  if (parsed.status !== "ok") throw new Error(`demo attempts snapshot invalid: ${parsed.reason}`);
  const org = await client.from("orgs").update({ trailer_assessment_enabled: true }).eq("id", IDS.org).eq("is_demo", true).select("id").single();
  if (org.error) throw new Error("demo assessment org failed");
  for (const attempt of [...parsed.attempts].sort((a,b)=>a.label.localeCompare(b.label))) {
    const saved = await client.from("trailer_attempts").insert({ ...attempt, trailer_id: DEMO_TRAILER_ID });
    if (saved.error) throw new Error("demo attempt seed failed");
  }
}

export async function seedDemoRetros(client: ReturnType<typeof createServiceSupabaseClient>): Promise<void> {
  const org = await client.from("orgs").select("is_demo").eq("id",IDS.org).single();
  if (org.error || org.data?.is_demo !== true) throw new Error("demo org identity check failed");
  const departments = DEMO_DEPARTMENTS.slice(0,2).map(dept => ({id:dept.id,users:DEMO_MEMBERS.filter(m=>m.dept_id===dept.id && m.user_id!==DEMO_REVIEWER_ID).slice(0,2).map(m=>m.user_id)}));
  for (const entry of buildDemoRetros(departments)) {
    const day = { ...entry.day }; delete day.display_name; delete day.title;
    const prior = await client.from("retro_days").delete().eq("id",day.id).eq("dept_id",day.dept_id);
    if (prior.error) throw new Error("demo retro cleanup failed");
    const saved = await client.from("retro_days").insert({...day,topics:[]});
    if (saved.error) throw new Error("demo retro day seed failed");
    const activities=await client.from("retro_activities").insert(entry.activities);
    if(activities.error) throw new Error("demo retro activity seed failed");
    if (!entry.revision) throw new Error("demo retro revision missing");
    const revisions=await client.from("retro_revisions").insert([{...entry.revision,revision:1,origin:"draft"},entry.revision]);
    if(revisions.error) throw new Error("demo retro revision seed failed");
  }
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
  await seedDemoUsers(client);
  for (const department of DEMO_DEPARTMENTS) {
    await seedDepartment(client, department);
  }
  if (process.env.SASU_RETRO_ENABLED === "true") await seedDemoRetros(client);
  await seedDemoReviewerAdmin(client);
  await seedDemoRetentionSettings(client);
  await seedDemoAgentRole(client);
  if (await seedDemoTrailer(client)) await seedDemoAttempts(client);
  console.log(`seed-demo complete: demo_org=1 departments=${DEMO_DEPARTMENTS.length} reviewer=1 prepared_answers=${DEMO_DEPARTMENTS.reduce((total, department) => total + department.answers.length, 0)} items=${DEMO_DEPARTMENTS.reduce((total, department) => total + department.items.length, 0)}`);
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntrypoint) {
  main().catch((error: unknown) => {
    console.error("seed-demo failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  });
}
