import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-shell";
import { Icon, type IconName } from "@/components/ui/icon";
import { orgAdminReadEnabled, trailerPublishEnabled } from "@/lib/features";
import { siteLinks } from "@/lib/site";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  DEMO_FEATURES,
  demoAutoLoginEnabled,
  isDemoReviewer,
} from "@/lib/demo-access";

type DemoDepartment = { id: string; name: string };
const departmentCopy: Record<
  string,
  { icon: IconName; description: string; example: string }
> = {
  "영업 사수": {
    icon: "briefcase",
    description: "견적과 계약 사이, 놓치기 쉬운 결정을 챙깁니다.",
    example: "견적 인상, 우리 팀은 어떻게 결정할까요?",
  },
  "개발 사수": {
    icon: "code",
    description: "배포부터 기술 검토까지, 결정의 맥락을 연결합니다.",
    example: "이번 배포 전에 확인해야 할 것은 무엇일까요?",
  },
  "기획팀 사수": {
    icon: "file",
    description: "흩어진 논의를 모아 팀의 다음 방향을 확인합니다.",
    example: "우리 팀의 원칙과 지난 결정을 함께 살펴보세요.",
  },
  "디자인팀 사수": {
    icon: "pen",
    description: "디자인의 기준과 피드백, 그 뒤의 이유를 기억합니다.",
    example: "팀의 디자인 원칙은 어떤 결정으로 이어질까요?",
  },
};
// 서버 전용 기능 플래그와 데모 링크를 배포 런타임 기준으로 일치시킨다.
export const dynamic = "force-dynamic";

const featureIcons: Record<(typeof DEMO_FEATURES)[number]["key"], IconName> = {
  dashboard: "grid",
  card: "spark",
  ledger: "book",
  ask: "chat",
  reviews: "file",
  documents: "file",
  roles: "people",
  retention: "book",
  settings: "settings",
  admin: "people",
  trailers: "video",
};

export default async function DemoLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo: accessMessage } = await searchParams;
  const autoLoginEnabled = demoAutoLoginEnabled();
  let reviewerConnected = false;
  let existingAccount = false;
  if (autoLoginEnabled) {
    const {
      data: { user },
    } = await (await createServerSupabaseClient()).auth.getUser();
    reviewerConnected = isDemoReviewer(user?.id);
    existingAccount = Boolean(user) && !reviewerConnected;
    if (!user && !accessMessage) redirect("/demo/access");
  }
  const links = siteLinks();
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase.rpc("demo_departments");
  const departments = (data ?? []) as DemoDepartment[];
  return (
    <>
      <SiteHeader />
      <main className="demo-landing">
        <header className="demo-intro">
          <span className="hero-label">
            <Icon name="spark" size={14} />
            {reviewerConnected ? "심사위원 데모 계정 · 자동 연결 완료" : "사수, 가볍게 만나보기"}
          </span>
          <h1>
            부서가 다르면,
            <br />
            사수의 답도 달라집니다.
          </h1>
          <p>
            가상 회사 온새미로에 오신 걸 환영합니다.
            <br />
            {reviewerConnected
              ? "부서장·조직 관리자 권한으로 모든 기능을 안전하게 확인하세요."
              : "함께 일할 부서를 고르고, 사수가 결정을 돕는 과정을 둘러보세요."}
          </p>
          <div className="demo-steps" aria-label="데모 체험 순서">
            <span>
              <b>1</b>부서 선택
            </span>
            <Icon name="chevron" size={13} />
            <span>
              <b>2</b>결정과 근거 확인
            </span>
            <Icon name="chevron" size={13} />
            <span>
              <b>3</b>사수에게 묻기
            </span>
          </div>
        </header>
        {reviewerConnected ? (
          <section className="demo-account-banner" aria-label="심사위원 데모 권한">
            <div className="demo-account-status">
              <span className="demo-account-avatar">심</span>
              <div>
                <strong>심사위원 데모 계정으로 접속했습니다</strong>
                <p>네 부서의 부서장 · 조직 관리자 · 합성 데이터 전용</p>
              </div>
            </div>
            <div className="demo-account-guards" aria-label="데모 안전 장치">
              <span>실제 데이터 없음</span>
              <span>외부 발신 없음</span>
              <span>영속 저장 없음</span>
            </div>
          </section>
        ) : accessMessage === "unavailable" ? (
          <section className="demo-access-message" role="alert">
            <div>
              <strong>자동 로그인 연결을 확인하지 못했습니다</strong>
              <p>아래 공개 데모는 바로 볼 수 있습니다. 잠시 후 자동 연결을 다시 시도해 주세요.</p>
            </div>
            <Link className="button button-primary button-small" href="/demo/access">
              자동 로그인 다시 시도
            </Link>
          </section>
        ) : existingAccount || accessMessage === "existing-account" ? (
          <section className="demo-access-message" role="status">
            <div>
              <strong>현재 로그인된 팀 계정을 유지했습니다</strong>
              <p>계정을 바꾸지 않았습니다. 심사위원 자동 데모는 시크릿 창에서 링크를 열어 확인할 수 있습니다.</p>
            </div>
          </section>
        ) : null}
        {reviewerConnected ? (
          <section className="demo-capabilities" aria-labelledby="demo-capabilities-heading">
            <header>
              <div>
                <p className="eyebrow">5분 셀프 시연</p>
                <h2 id="demo-capabilities-heading">전체 기능을 순서대로 확인하세요</h2>
                <p>앞의 네 기능이 핵심 이야기입니다. 나머지는 관심 있는 운영 기능부터 자유롭게 열어보세요.</p>
              </div>
              <Link className="button button-primary" href={DEMO_FEATURES[0].href}>
                추천 시연 시작 <Icon name="arrow" size={15} />
              </Link>
            </header>
            <ol className="demo-feature-grid">
              {DEMO_FEATURES.map((feature, index) => (
                <li key={feature.key}>
                  <Link href={feature.href}>
                    <span className="demo-feature-number">{String(index + 1).padStart(2, "0")}</span>
                    <span className="demo-feature-icon"><Icon name={featureIcons[feature.key]} size={19} /></span>
                    <span className="demo-feature-copy">
                      <strong>{feature.title}</strong>
                      <small>{feature.audience} · {feature.mode === "live_read" ? "시드 결과 확인" : "안전 체험"}</small>
                      <span>{feature.description}</span>
                    </span>
                    <Icon name="chevron" size={16} />
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {error || departments.length === 0 ? (
          <section className="empty-state">
            <h2 className="text-xl">데모를 준비하는 중입니다</h2>
            <p>잠시 후 다시 접속해주세요.</p>
            <Link className="text-link" href="/">
              메인으로 돌아가기
            </Link>
          </section>
        ) : (
          <section className="department-grid" aria-label="데모 부서 선택">
            {departments.map((department) => {
              const recommended = department.name === "영업 사수";
              const copy = departmentCopy[department.name] ?? {
                icon: "people" as const,
                description:
                  "우리 부서의 대화와 결정, 근거를 한곳에서 확인하세요.",
                example: "부서의 기록에서 다음 결정의 힌트를 찾아보세요.",
              };
              return (
                <Link
                  className={`department-card ${recommended ? "department-card-recommended" : ""}`}
                  href={`/demo/d/${department.id}`}
                  key={department.id}
                >
                  <div className="department-card-top">
                    <span className="department-icon">
                      <Icon name={copy.icon} size={23} />
                    </span>
                    <span className={`badge ${recommended ? "badge-green" : "badge-neutral"}`}>
                      {recommended ? "추천 · 90초 핵심 데모" : "다른 사례"}
                    </span>
                  </div>
                  <div>
                    <h2>{department.name}</h2>
                    <p>{copy.description}</p>
                  </div>
                  <div className="department-example">{copy.example}</div>
                  <div className="department-card-footer">
                    <span>{recommended ? "핵심 데모 시작" : "이 부서 둘러보기"}</span>
                    <Icon name="arrow" size={17} />
                  </div>
                </Link>
              );
            })}
          </section>
        )}
        <div className="demo-more">
          {orgAdminReadEnabled() ? (
            <Link className="text-link" href="/demo/admin">
              조직 단위로 보기 <Icon name="arrow" size={14} />
            </Link>
          ) : null}
          {trailerPublishEnabled() ? (
            <Link
              className="text-link"
              href="/demo/d/cccccccc-cccc-4ccc-8ccc-cccccccccccc/trailers"
            >
              채용 예고편 만드는 과정 <Icon name="arrow" size={14} />
            </Link>
          ) : null}
        </div>
        <footer className="demo-footer">
          <p>{reviewerConnected ? "자동 로그인된 심사 계정 · 영속 변경 없는 안전 체험" : "가입 없이 체험"} · 회사·인물·대화는 모두 합성 데이터입니다.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/login">우리 팀으로 로그인</Link>
            {links.pilotContactUrl ? (
              <a href={links.pilotContactUrl} target="_blank" rel="noreferrer">
                파일럿 문의
              </a>
            ) : null}
            {links.voteUrl ? (
              <a href={links.voteUrl} target="_blank" rel="noreferrer">
                투표하기
              </a>
            ) : null}
            <Link href="/">사수 알아보기</Link>
          </div>
        </footer>
      </main>
    </>
  );
}
