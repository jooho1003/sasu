type FeatureEnv = Readonly<Record<string, string | undefined>>;

export const DEMO_ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const DEMO_REVIEWER_ID = "99999999-9999-4999-8999-999999999991";
export const DEMO_DEFAULT_DEPT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const DEMO_DEPARTMENT_IDS = [
  DEMO_DEFAULT_DEPT_ID,
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
] as const;

export const DEMO_REVIEWER_EMAIL = "judge-demo@demo.sasu.team";

export const DEMO_NOTION_ROOTS = [
  {
    id: "a1000000-0000-4000-8000-000000000001",
    org_id: DEMO_ORG_ID,
    dept_id: DEMO_DEFAULT_DEPT_ID,
    scope: "subtree" as const,
    notion_id: "demo-sales-principles",
    notion_kind: "page" as const,
    top_title: "영업 운영 위키 (합성)",
    visibility: "dept" as const,
    include_new: true,
    card_candidates: false,
    created_role: "lead" as const,
    state: "idle" as const,
    discovered_count: 5,
    completed_count: 2,
    pending_count: 1,
    failed_count: 1,
    excluded_count: 1,
  },
  {
    id: "a2000000-0000-4000-8000-000000000001",
    org_id: DEMO_ORG_ID,
    dept_id: DEMO_DEPARTMENT_IDS[1],
    scope: "subtree" as const,
    notion_id: "demo-dev-principles",
    notion_kind: "page" as const,
    top_title: "개발 운영 위키 (합성)",
    visibility: "dept" as const,
    include_new: true,
    card_candidates: false,
    created_role: "lead" as const,
    state: "idle" as const,
    discovered_count: 4,
    completed_count: 2,
    pending_count: 1,
    failed_count: 1,
    excluded_count: 0,
  },
] as const;

export const DEMO_NOTION_SOURCES = [
  { id: "10000000-0000-4000-8000-000000000101", dept_id: DEMO_DEFAULT_DEPT_ID, root_id: DEMO_NOTION_ROOTS[0].id, external_id: "demo-sales-principles", title: "영업 원칙 문서", visibility: "dept" as const, is_principles: true, active: true, last_synced_at: "2026-09-18T00:30:00.000Z", last_error: null, parent_external_id: null },
  { id: "10000000-0000-4000-8000-000000000104", dept_id: DEMO_DEFAULT_DEPT_ID, root_id: DEMO_NOTION_ROOTS[0].id, external_id: "demo-sales-price-policy", title: "가격·할인 승인 기준", visibility: "dept" as const, is_principles: false, active: true, last_synced_at: "2026-09-18T00:25:00.000Z", last_error: null, parent_external_id: "demo-sales-principles" },
  { id: "10000000-0000-4000-8000-000000000105", dept_id: DEMO_DEFAULT_DEPT_ID, root_id: DEMO_NOTION_ROOTS[0].id, external_id: "demo-sales-contract-notes", title: "고객 계약 검토 기록", visibility: "leads_only" as const, is_principles: false, active: true, last_synced_at: null, last_error: null, parent_external_id: "demo-sales-principles" },
  { id: "10000000-0000-4000-8000-000000000106", dept_id: DEMO_DEFAULT_DEPT_ID, root_id: DEMO_NOTION_ROOTS[0].id, external_id: "demo-sales-partner-db", title: "파트너 현황 데이터베이스", visibility: "dept" as const, is_principles: false, active: true, last_synced_at: null, last_error: "notion_database_unsupported", parent_external_id: "demo-sales-principles" },
  { id: "10000000-0000-4000-8000-000000000107", dept_id: DEMO_DEFAULT_DEPT_ID, root_id: DEMO_NOTION_ROOTS[0].id, external_id: "demo-sales-old-meetings", title: "이전 영업 회의록", visibility: "dept" as const, is_principles: false, active: false, last_synced_at: "2026-09-17T23:00:00.000Z", last_error: "notion_excluded", parent_external_id: "demo-sales-principles" },
  { id: "20000000-0000-4000-8000-000000000101", dept_id: DEMO_DEPARTMENT_IDS[1], root_id: DEMO_NOTION_ROOTS[1].id, external_id: "demo-dev-principles", title: "개발 원칙 문서", visibility: "dept" as const, is_principles: true, active: true, last_synced_at: "2026-09-18T00:35:00.000Z", last_error: null, parent_external_id: null },
  { id: "20000000-0000-4000-8000-000000000107", dept_id: DEMO_DEPARTMENT_IDS[1], root_id: DEMO_NOTION_ROOTS[1].id, external_id: "demo-dev-release", title: "배포·롤백 체크리스트", visibility: "dept" as const, is_principles: false, active: true, last_synced_at: "2026-09-18T00:32:00.000Z", last_error: null, parent_external_id: "demo-dev-principles" },
  { id: "20000000-0000-4000-8000-000000000108", dept_id: DEMO_DEPARTMENT_IDS[1], root_id: DEMO_NOTION_ROOTS[1].id, external_id: "demo-dev-architecture", title: "서비스 구조 기록", visibility: "leads_only" as const, is_principles: false, active: true, last_synced_at: null, last_error: null, parent_external_id: "demo-dev-principles" },
  { id: "20000000-0000-4000-8000-000000000109", dept_id: DEMO_DEPARTMENT_IDS[1], root_id: DEMO_NOTION_ROOTS[1].id, external_id: "demo-dev-large-spec", title: "대규모 기술 명세", visibility: "dept" as const, is_principles: false, active: true, last_synced_at: null, last_error: "notion_page_too_large", parent_external_id: "demo-dev-principles" },
] as const;

export const DEMO_NOTION_EXCLUSIONS = [
  { dept_id: DEMO_DEFAULT_DEPT_ID, notion_id: "demo-sales-old-meetings", subtree: true },
] as const;

export type DemoFeature = {
  key:
    | "dashboard"
    | "card"
    | "ledger"
    | "ask"
    | "reviews"
    | "documents"
    | "roles"
    | "retention"
    | "settings"
    | "admin"
    | "trailers"
    | "notion";
  title: string;
  description: string;
  href: string;
  mode: "live_read" | "safe_preview";
  audience: "팀원" | "부서장" | "조직 관리자";
};

const SALES_DEPT_ID = DEMO_DEFAULT_DEPT_ID;
const DEV_DEPT_ID = DEMO_DEPARTMENT_IDS[1];
const SALES_CARD_ID = "10000000-0000-4000-8000-000000000121";

export const DEMO_FEATURES: readonly DemoFeature[] = [
  { key: "notion", title: "Notion 자동 수집", description: "최상위 범위 매핑, 수집 현황, 문서 제외와 카드 후보 설정을 안전하게 체험", href: "/demo/notion", mode: "safe_preview", audience: "조직 관리자" },
  { key: "dashboard", title: "분류 대시보드", description: "슬랙·회의·문서 기록이 결정·액션·정보로 분류되는 흐름", href: `/demo/d/${SALES_DEPT_ID}`, mode: "live_read", audience: "팀원" },
  { key: "card", title: "지금 결정 카드", description: "마감·추천·원문 근거·과거 결정 충돌과 안전한 결정 체험", href: `/demo/d/${SALES_DEPT_ID}/cards/${SALES_CARD_ID}`, mode: "safe_preview", audience: "부서장" },
  { key: "ledger", title: "결정 원장", description: "결정 이유와 인용, 정정 이력을 남기는 append-only 기록", href: `/demo/d/${SALES_DEPT_ID}/ledger`, mode: "live_read", audience: "팀원" },
  { key: "ask", title: "권한 인지 묻기", description: "같은 질문이 부서별 근거에 따라 달라지고, 없으면 거절되는 답변", href: `/demo/d/${SALES_DEPT_ID}/ask?q=vendor-price`, mode: "safe_preview", audience: "팀원" },
  { key: "reviews", title: "음성·자료 검토", description: "업로드, 참여자 동의, 전사·추출 검토, 근거 확정 과정을 확인", href: `/demo/d/${DEV_DEPT_ID}/reviews`, mode: "safe_preview", audience: "부서장" },
  { key: "documents", title: "문서 어시스턴트", description: "문서 요약·결정·액션·열린 질문과 원문 인용을 확인", href: `/demo/d/${DEV_DEPT_ID}/documents`, mode: "live_read", audience: "부서장" },
  { key: "roles", title: "문서 평가", description: "부서 기준표와 근거 기반 점수표, 근거 없음 처리를 확인", href: `/demo/d/${DEV_DEPT_ID}/roles`, mode: "live_read", audience: "부서장" },
  { key: "retention", title: "기록 보존", description: "채널별 기록 범위와 내보내기·보존 점검 절차를 확인", href: `/demo/d/${SALES_DEPT_ID}/retention`, mode: "safe_preview", audience: "부서장" },
  { key: "settings", title: "부서 세팅", description: "멤버 동의, Slack 연결, 원칙 문서와 공개 범위 설정을 확인", href: `/demo/d/${SALES_DEPT_ID}/settings`, mode: "safe_preview", audience: "부서장" },
  { key: "admin", title: "조직 관리", description: "부서·멤버·수집 채널·답변 집계를 내용 열람 없이 확인", href: "/demo/admin", mode: "live_read", audience: "조직 관리자" },
  { key: "trailers", title: "채용 예고편", description: "원장 결정에서 공개 검토와 합성 지원자 점수표로 이어지는 흐름", href: `/demo/d/${DEV_DEPT_ID}/trailers`, mode: "live_read", audience: "부서장" },
];

export function demoAutoLoginEnabled(env: FeatureEnv = process.env): boolean {
  return env.SASU_DEMO_AUTO_LOGIN_ENABLED === "true";
}

export function demoReviewerEmail(env: FeatureEnv = process.env): string {
  return env.SASU_DEMO_USER_EMAIL?.trim().toLowerCase() || DEMO_REVIEWER_EMAIL;
}

export function isDemoReviewer(userId: string | null | undefined): boolean {
  return userId === DEMO_REVIEWER_ID;
}

export function safeDemoDestination(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/demo";
  }

  let parsed: URL;
  try {
    parsed = new URL(value, "https://demo.invalid");
  } catch {
    return "/demo";
  }
  if (parsed.origin !== "https://demo.invalid") return "/demo";
  if (parsed.pathname === "/demo") return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (parsed.pathname === "/demo/access") return "/demo";
  if (parsed.pathname === "/demo/admin") return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (parsed.pathname === "/demo/notion") return `${parsed.pathname}${parsed.search}${parsed.hash}`;

  const match = parsed.pathname.match(/^\/demo\/d\/([^/]+)(?:\/.*)?$/u);
  if (!match || !DEMO_DEPARTMENT_IDS.includes(match[1] as (typeof DEMO_DEPARTMENT_IDS)[number])) {
    return "/demo";
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
