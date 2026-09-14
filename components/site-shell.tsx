import Link from "next/link";

import type { SiteLinks } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-[color:var(--bg)/0.94] backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
        <Link className="font-[family-name:var(--font-heading)] text-2xl font-bold no-underline" href="/">
          사수
        </Link>
        <nav aria-label="주요 메뉴" className="hidden items-center gap-6 text-sm md:flex">
          <Link href="/#how">작동 방식</Link>
          <Link href="/#difference">차이</Link>
          <Link href="/#trust">신뢰</Link>
          <Link href="/login">로그인</Link>
        </nav>
        <Link className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white no-underline" href="/demo">
          데모 보기
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter({ links }: { links: SiteLinks }) {
  return (
    <footer className="border-t border-black/10 bg-[var(--ink)] text-[var(--bg)]">
      <div className="mx-auto grid w-full max-w-7xl gap-7 px-5 py-10 sm:px-8 md:grid-cols-[1fr_auto]">
        <div className="grid gap-2">
          <strong className="font-[family-name:var(--font-heading)] text-2xl">사수</strong>
          <span className="text-sm opacity-75">원티드 AI Championship 2026 출품작</span>
          <span className="text-sm opacity-75">데모의 회사·인물·대화는 모두 합성입니다.</span>
        </div>
        <nav aria-label="하단 메뉴" className="flex flex-wrap content-start gap-5 text-sm">
          <Link className="text-inherit" href="/privacy">개인정보 처리 안내</Link>
          <Link className="text-inherit" href="/demo">게스트 데모</Link>
          {links.pilotContactUrl ? (
            <a className="text-inherit" href={links.pilotContactUrl}>문의</a>
          ) : null}
        </nav>
      </div>
    </footer>
  );
}
