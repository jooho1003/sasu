"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark, Icon, type IconName } from "@/components/ui/icon";
import { UI_LABELS } from "@/lib/labels";

type WorkspaceShellProps = {
  children: React.ReactNode;
  deptId: string;
  departmentName: string;
  demo?: boolean;
  fullDemo?: boolean;
  showOrgAdmin?: boolean;
  showTrailers?: boolean;
  showRetros?: boolean;
  displayName?: string;
  firstCardId?: string;
};

export function WorkspaceShell({
  children,
  deptId,
  departmentName,
  demo = false,
  fullDemo = false,
  showOrgAdmin = false,
  showTrailers = false,
  showRetros = false,
  displayName,
  firstCardId,
}: WorkspaceShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = usePathname();
  const base = `${demo ? "/demo" : ""}/d/${deptId}`;
  const entries: { label: string; suffix: string; icon: IconName }[] = [
    { label: "대시보드", suffix: "", icon: "grid" },
    { label: "묻기", suffix: "/ask", icon: "chat" },
    { label: UI_LABELS.ledger, suffix: "/ledger", icon: "book" },
    ...(showRetros ? [{ label: "회고", suffix: "/retros", icon: "book" as const }] : []),
    ...(!demo || fullDemo
      ? [{ label: UI_LABELS.reviews, suffix: "/reviews", icon: "file" as const }, { label: "문서", suffix: "/documents", icon: "file" as const }]
      : []),
    { label: UI_LABELS.roles, suffix: "/roles", icon: "people" },
    ...(showTrailers
      ? [{ label: "예고편", suffix: "/trailers", icon: "video" as const }]
      : []),
    ...(!demo || fullDemo
      ? [{ label: UI_LABELS.retention, suffix: "/retention", icon: "book" as const }, { label: UI_LABELS.settings, suffix: "/settings", icon: "settings" as const }]
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
      href: pathname.includes("/cards/") ? pathname : firstCardId ? `${base}/cards/${firstCardId}` : `${base}/documents`,
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
    <div className={`workspace-shell${sidebarOpen ? "" : " sidebar-collapsed"}`}>
      <a className="skip-link" href="#workspace-main">
        본문으로 건너뛰기
      </a>
      <aside id="workspace-sidebar" className="workspace-sidebar" hidden={!sidebarOpen}>
        <Link className="brand" href={demo ? "/demo" : "/"}>
          <BrandMark />
          사수<span className="brand-caption">팀의 결정 도우미</span>
        </Link>
        <div className="workspace-team">
          <span className="team-avatar">{departmentName.slice(0, 1)}</span>
          <div>
            <strong>{departmentName}</strong>
            <span>
              {demo ? "온새미로 · 데모 공간" : "우리 부서 공간"}
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
        <p className="nav-caption">부서 메뉴</p>
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
              <strong>{fullDemo ? "기능 한눈에 보기" : "우리 팀에도 사수를."}</strong>
              <p>
                {fullDemo ? <>무엇을 어떤 순서로 보면<br />좋은지 모았습니다.</> : <>흩어진 대화를<br />다음 결정으로 연결하세요.</>}
              </p>
              <Link href={fullDemo ? `/demo/features?dept=${deptId}` : "/#pilot"}>
                {fullDemo ? "한눈에 보기" : "사수 알아보기"} <Icon name="arrow" size={15} />
              </Link>
            </div>
          ) : null}
          <div className="workspace-profile">
            <span className="profile-avatar">
              {demo ? "G" : (displayName?.slice(0, 1) ?? "사")}
            </span>
            <div>
              <strong>{demo ? "로그인 없이 보기" : (displayName ?? "팀 멤버")}</strong>
              <span>
                {demo ? "모든 기능을 눌러 볼 수 있습니다" : "부서 권한으로 연결됨"}
              </span>
            </div>
          </div>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <button className="sidebar-toggle" type="button" aria-expanded={sidebarOpen} aria-controls="workspace-sidebar" onClick={() => setSidebarOpen(open => !open)}>{sidebarOpen ? "☰ 메뉴 접기" : "☰ 메뉴 열기"}</button>
          <span>
            <span className="workspace-parent">{departmentName}<span className="breadcrumb-divider">/</span></span>
            <strong>
              {pathname.includes("/cards/")
                ? "결정 카드"
                : (activeEntry?.label ?? "부서 메뉴")}
            </strong>
          </span>
          <span className="badge badge-neutral">
            <Icon name="lock" size={13} />
            {demo ? "가상 회사 체험" : "내 부서 공간"}
          </span>
        </header>
        {demo ? (
          <>
            <div className="demo-mobile-progress" aria-label={journey.map(x=>`${x.step}/4 ${x.label}`).join(", ")}>
              <span>가상 회사 체험</span>
              {showDemoJourney?<Link href={journey[journeyStep-1].href}>{journeyStep}/4 {journey[journeyStep-1].label}</Link>:<Link href="/demo">다른 부서 보기</Link>}
            </div>
            <div className="demo-notice">
              <span>
                <span className="status-dot" />
                가상 회사 자료입니다. 눌러 봐도 실제로는 바뀌지 않고, 새로 고치면 처음으로 돌아갑니다.
              </span>
              <Link href="/demo">
                다른 부서 보기 <Icon name="arrow" size={14} />
              </Link>
            </div>
            {showDemoJourney ? <nav className="demo-journey" aria-label="로그인 없이 보기 진행 단계">
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
