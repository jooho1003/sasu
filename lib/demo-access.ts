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
    | "trailers";
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

  const match = parsed.pathname.match(/^\/demo\/d\/([^/]+)(?:\/.*)?$/u);
  if (!match || !DEMO_DEPARTMENT_IDS.includes(match[1] as (typeof DEMO_DEPARTMENT_IDS)[number])) {
    return "/demo";
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
