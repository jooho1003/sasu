import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteCta } from "@/components/site-cta";
import { siteLinks } from "@/lib/site";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

export default async function DemoDepartmentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const links = siteLinks();
  const supabase = createPublicSupabaseClient();
  const { data: department } = await supabase
    .from("departments")
    .select("id, name")
    .eq("id", dept)
    .maybeSingle<{ id: string; name: string }>();

  if (!department) {
    notFound();
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-black/10 bg-[var(--surface)]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-4">
            <Link className="font-bold text-[var(--accent)]" href="/demo">사수 데모</Link>
            <span className="text-sm text-[var(--muted)]">{department.name}</span>
          </div>
          <nav className="flex flex-wrap gap-4 text-sm">
            <Link href={`/demo/d/${dept}`}>대시보드</Link>
            <Link href={`/demo/d/${dept}/ledger`}>원장</Link>
            <Link href={`/demo/d/${dept}/ask`}>묻기</Link>
            <Link href={`/demo/d/${dept}/roles`}>역할</Link>
          </nav>
        </div>
      </header>
      {children}
      <aside className="border-t border-black/10 bg-[var(--surface)]" aria-label="게스트 데모 다음 단계">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-5 py-7 sm:px-8 md:grid-cols-[1fr_auto] md:items-center">
          <div><strong className="text-lg">우리 부서의 결정도 사수하세요</strong><p className="mb-0 mt-1 text-sm text-[var(--muted)]">파일럿 문의 또는 대회 투표로 이어갈 수 있습니다.</p></div>
          <SiteCta compact links={links} showHome />
        </div>
      </aside>
    </div>
  );
}
