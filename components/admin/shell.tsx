"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark, Icon, type IconName } from "@/components/ui/icon";

const entries: { key: string; label: string; icon: IconName }[] = [
  { key: "overview", label: "개요", icon: "grid" },
  { key: "members", label: "멤버", icon: "people" },
  { key: "sources", label: "수집 채널", icon: "hash" },
  { key: "audit", label: "기록", icon: "book" },
];

export function AdminShell({
  children,
  orgName,
  demoSection,
}: {
  children: React.ReactNode;
  orgName: string;
  demoSection?: string;
}) {
  const pathname = usePathname();
  const demo = demoSection !== undefined;
  const active = demoSection ?? (pathname.split("/")[2] || "overview");
  return (
    <div className="workspace-shell admin-shell">
      <a className="skip-link" href="#workspace-main">
        본문으로 건너뛰기
      </a>
      <aside className="workspace-sidebar">
        <Link className="brand" href={demo ? "/demo" : "/"}>
          <BrandMark />
          사수<span className="brand-caption">팀을 위한 AI</span>
        </Link>
        <div className="workspace-team">
          <span className="team-avatar">
            <Icon name="briefcase" />
          </span>
          <div>
            <strong>{orgName}</strong>
            <span>{demo ? "조직 관리 데모" : "조직 관리자 공간"}</span>
          </div>
        </div>
        <p className="nav-caption">조직 관리</p>
        <nav className="workspace-nav" aria-label="조직 관리">
          {entries.map(({ key, label, icon }) => (
            <Link
              key={key}
              aria-current={key === active ? "page" : undefined}
              href={
                demo
                  ? `/demo/admin${key === "overview" ? "" : `?view=${key}`}`
                  : `/admin${key === "overview" ? "" : `/${key}`}`
              }
            >
              <Icon name={icon} />
              <span>{label}</span>
              {key === active ? <span className="nav-dot" /> : null}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Icon name="lock" />
            <strong>권한에 맞는 정보만.</strong>
            <p>이곳에서는 조직의 운영 현황과 연결 상태를 확인합니다.</p>
          </div>
          <Link className="sidebar-link" href={demo ? "/demo" : "/"}>
            <Icon name="arrow" size={17} />
            {demo ? "부서 데모 보기" : "사수 홈"}
          </Link>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <span>
            조직 관리<span className="breadcrumb-divider">/</span>
            <strong>
              {entries.find((entry) => entry.key === active)?.label ?? "개요"}
            </strong>
          </span>
          {demo ? (
            <Link className="text-link" href="/demo">
              부서 선택으로 <Icon name="arrow" size={14} />
            </Link>
          ) : (
            <form method="post" action="/auth/signout">
              <button className="text-link" type="submit">
                로그아웃
              </button>
            </form>
          )}
        </header>
        {demo ? (
          <div className="demo-notice">
            <span>
              <Icon name="spark" size={15} />
              게스트 모드 · 합성 데이터 · 읽기 전용
            </span>
          </div>
        ) : null}
        <main
          id="workspace-main"
          tabIndex={-1}
          className="workspace-page admin-page"
        >
          <div className="admin-privacy-note">
            <Icon name="lock" size={15} />
            <span>조직 관리자 권한만으로는 부서 내용을 볼 수 없습니다</span>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
