import Link from "next/link";
import type { SiteLinks } from "@/lib/site";
import { BrandMark, Icon } from "@/components/ui/icon";

const navigation = [
  ["/#how", "작동 방식"],
  ["/#difference", "사수가 하는 일"],
  ["/#trust", "신뢰와 보안"],
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" href="/" aria-label="사수 홈">
          <BrandMark />
          사수
        </Link>
        <nav aria-label="주요 메뉴" className="site-nav">
          {navigation.map(([href, label]) => (
            <Link href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="site-actions">
          <Link className="text-link site-login" href="/login">
            로그인
          </Link>
          <a className="button button-primary button-small" href="/demo">
            데모 보기 <Icon name="arrow" size={14} />
          </a>
          <details className="mobile-site-menu">
            <summary>
              <span className="menu-open-label">메뉴 열기</span>
              <span className="menu-close-label">메뉴 닫기</span>
            </summary>
            <nav aria-label="모바일 메뉴">
              {navigation.map(([href, label]) => (
                <Link href={href} key={href}>
                  {label}
                </Link>
              ))}
              <Link href="/login">로그인</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ links }: { links: SiteLinks }) {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div>
          <Link className="brand" href="/">
            <BrandMark small />
            사수
          </Link>
          <p>팀의 맥락을 기억하고, 다음 결정을 돕습니다.</p>
          <p>
            원티드 AI Championship 2026 출품작 · 데모의 회사·인물·대화는 모두
            합성입니다.
          </p>
        </div>
        <nav aria-label="하단 메뉴">
          <Link href="/privacy">개인정보 처리 안내</Link>
          <a href="/demo">게스트 데모</a>
          {links.pilotContactUrl ? (
            <a href={links.pilotContactUrl}>문의</a>
          ) : null}
        </nav>
      </div>
    </footer>
  );
}
