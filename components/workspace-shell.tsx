"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark, Icon, type IconName } from "@/components/ui/icon";

type WorkspaceShellProps = {
  children: React.ReactNode;
  deptId: string;
  departmentName: string;
  demo?: boolean;
  fullDemo?: boolean;
  showOrgAdmin?: boolean;
  showTrailers?: boolean;
  displayName?: string;
};

export function WorkspaceShell({
  children,
  deptId,
  departmentName,
  demo = false,
  fullDemo = false,
  showOrgAdmin = false,
  showTrailers = false,
  displayName,
}: WorkspaceShellProps) {
  const pathname = usePathname();
  const base = `${demo ? "/demo" : ""}/d/${deptId}`;
  const entries: { label: string; suffix: string; icon: IconName }[] = [
    { label: "대시보드", suffix: "", icon: "grid" },
    { label: "묻기", suffix: "/ask", icon: "chat" },
    { label: "원장", suffix: "/ledger", icon: "book" },
    ...(!demo || fullDemo
      ? [{ label: "음성·자료 검토", suffix: "/reviews", icon: "file" as const }, { label: "문서", suffix: "/documents", icon: "file" as const }]
      : []),
    { label: "문서 평가", suffix: "/roles", icon: "people" },
    ...(showTrailers
      ? [{ label: "예고편", suffix: "/trailers", icon: "video" as const }]
      : []),
    ...(!demo || fullDemo
      ? [{ label: "기록 보존", suffix: "/retention", icon: "book" as const }, { label: "세팅", suffix: "/settings", icon: "settings" as const }]
      : []),
  ];
  const activeEntry = entries.find(({ suffix }) =>
    suffix
      ? pathname.startsWith(`${base}${suffix}`)
      : pathname === base || pathname.startsWith(`${base}/cards/`),
  );
  const primarySuffixes = new Set(
    demo
      ? ["", "/ask", "/ledger", "/roles"]
      : ["", "/ask", "/ledger", "/reviews"],
  );
  const secondaryEntries = entries.filter(
    ({ suffix }) => !primarySuffixes.has(suffix),
  );
  const activeSecondary = secondaryEntries.find(
    ({ suffix }) => activeEntry?.suffix === suffix,
  );
  const journeyStep = pathname.includes("/cards/")
    ? 2
    : pathname.startsWith(`${base}/ledger`)
      ? 3
      : pathname.startsWith(`${base}/ask`)
        ? 4
        : 1;
  const journey = [
    { step: 1, label: "결정 발견", href: base },
    {
      step: 2,
      label: "근거 확인",
      href: pathname.includes("/cards/") ? pathname : `${base}#demo-cards-heading`,
    },
    { step: 3, label: "과거 결정", href: `${base}/ledger` },
    { step: 4, label: "같은 질문", href: `${base}/ask?q=principle` },
  ];
  const showDemoJourney =
    demo &&
    (pathname === base ||
      pathname.includes("/cards/") ||
      pathname.startsWith(`${base}/ledger`) ||
      pathname.startsWith(`${base}/ask`));

  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#workspace-main">
        본문으로 건너뛰기
      </a>
      <aside className="workspace-sidebar">
        <Link className="brand" href={demo ? "/demo" : "/"}>
          <BrandMark />
          사수<span className="brand-caption">팀을 위한 AI</span>
        </Link>
        <div className="workspace-team">
          <span className="team-avatar">{departmentName.slice(0, 1)}</span>
          <div>
            <strong>{departmentName}</strong>
            <span>
              {demo ? (fullDemo ? "온새미로 · 심사 공간" : "온새미로 · 데모 공간") : "우리 부서 워크스페이스"}
            </span>
          </div>
          {demo ? (
            <Link
              className="team-switch"
              href="/demo"
              aria-label="다른 부서 선택"
            >
              <Icon name="chevron" size={15} />
            </Link>
          ) : null}
        </div>
        <p className="nav-caption">워크스페이스</p>
        <nav aria-label="부서 메뉴" className="workspace-nav">
          {entries.map(({ label, suffix, icon }) => (
            <Link
              className={primarySuffixes.has(suffix) ? "mobile-primary" : "mobile-secondary"}
              key={suffix}
              href={`${base}${suffix}`}
              aria-current={activeEntry?.suffix === suffix ? "page" : undefined}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {activeEntry?.suffix === suffix ? (
                <span className="nav-dot" />
              ) : null}
            </Link>
          ))}
          {secondaryEntries.length > 0 ? (
            <details className="workspace-more-menu">
              <summary aria-label="부서 메뉴 더보기">
                <Icon name="settings" />
                <span>{activeSecondary?.label ?? "더보기"}</span>
              </summary>
              <div>
                {secondaryEntries.map(({ label, suffix, icon }) => (
                  <Link
                    key={suffix}
                    href={`${base}${suffix}`}
                    aria-current={activeEntry?.suffix === suffix ? "page" : undefined}
                  >
                    <Icon name={icon} size={16} />
                    {label}
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
        </nav>
        <div className="sidebar-bottom">
          {showOrgAdmin ? (
            <Link
              className="sidebar-link"
              href={demo ? "/demo/admin" : "/admin"}
            >
              <Icon name="people" size={17} />
              조직 관리
            </Link>
          ) : null}
          {demo ? (
            <div className="sidebar-note">
              <Icon name="spark" />
              <strong>{fullDemo ? "전체 기능 지도" : "우리 팀에도 사수를."}</strong>
              <p>
                {fullDemo ? <>확인할 기능과<br />추천 순서를 한눈에.</> : <>흩어진 대화를<br />다음 결정으로 연결하세요.</>}
              </p>
              <Link href={fullDemo ? "/demo" : "/#pilot"}>
                {fullDemo ? "기능 지도로" : "사수 알아보기"} <Icon name="arrow" size={15} />
              </Link>
            </div>
          ) : null}
          <div className="workspace-profile">
            <span className="profile-avatar">
              {demo ? (fullDemo ? "심" : "G") : (displayName?.slice(0, 1) ?? "사")}
            </span>
            <div>
              <strong>{demo ? (fullDemo ? "심사위원 데모" : "게스트") : (displayName ?? "팀 멤버")}</strong>
              <span>
                {demo ? (fullDemo ? "부서장 · 조직 관리자 권한" : "가입 없이 둘러보는 중") : "부서 권한으로 연결됨"}
              </span>
            </div>
          </div>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <span>
            {departmentName}
            <span className="breadcrumb-divider">/</span>
            <strong>
              {pathname.includes("/cards/")
                ? "결정 카드"
                : (activeEntry?.label ?? "워크스페이스")}
            </strong>
          </span>
          <span className="badge badge-neutral">
            <Icon name="lock" size={13} />
            {demo ? (fullDemo ? "심사 안전 데모" : "읽기 전용 데모") : "내 부서 공간"}
          </span>
        </header>
        {demo ? (
          <>
            <div className="demo-notice">
              <span>
                <span className="status-dot" />
                {fullDemo ? "합성 계정으로 모든 기능을 안전하게 확인하세요." : "합성 데이터로 자유롭게 둘러보세요."}
              </span>
              <Link href="/demo">
                다른 부서 보기 <Icon name="arrow" size={14} />
              </Link>
            </div>
            {showDemoJourney ? <nav className="demo-journey" aria-label="게스트 데모 진행 단계">
              {journey.map(({ step, label, href }) => (
                <Link
                  href={href}
                  key={step}
                  aria-current={journeyStep === step ? "step" : undefined}
                >
                  <b>{step}</b>
                  <span>{label}</span>
                </Link>
              ))}
            </nav> : null}
          </>
        ) : null}
        <div id="workspace-main" className="workspace-content" tabIndex={-1}>
          {children}
        </div>
      </div>
    </div>
  );
}
