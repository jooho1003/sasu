import type { Metadata } from "next";
import Link from "next/link";
import { adminContext, adminOverview } from "./_data";

export const metadata: Metadata = { title: "조직 관리 | 사수", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const context = await adminContext();
  if (context.status !== "ok") return <main className="center-shell"><h1 className="text-2xl">조직 관리자 권한이 없습니다</h1><p>조직 관리자에게 계정의 권한을 확인해 주세요.</p><form method="post" action="/auth/signout"><button className="rounded-xl border border-accent px-4 py-2" type="submit">로그아웃</button></form><Link href="/demo">데모 보기</Link></main>;
  const overview = await adminOverview();
  return <div className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
    <header className="grid gap-5 border-b border-ink/10 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4"><Link href="/" className="text-xl">사수</Link><span className="rounded-full bg-accent/10 px-3 py-1 text-sm font-bold text-accent">조직 관리자</span><form method="post" action="/auth/signout"><button className="text-sm underline" type="submit">로그아웃</button></form></div>
      <p className="m-0 text-xl font-bold">{overview?.org_name ?? "조직 관리"}</p>
      <nav aria-label="조직 관리" className="flex flex-wrap gap-5 text-sm">{[["개요", "/admin"], ["멤버", "/admin/members"], ["수집 채널", "/admin/sources"], ["기록", "/admin/audit"]].map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav>
      <p className="m-0 rounded-xl bg-accent/5 px-4 py-3 text-sm text-muted">조직 관리자 권한만으로는 부서 내용을 볼 수 없습니다</p>
    </header>
    <main className="grid min-w-0 gap-6 py-7">{children}</main>
  </div>;
}
