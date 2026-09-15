import Link from "next/link";

import { SiteCta } from "@/components/site-cta";
import { siteLinks } from "@/lib/site";
import { orgAdminReadEnabled, trailerPublishEnabled } from "@/lib/features";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

type DemoDepartment = { id: string; name: string };

export const revalidate = 60;

export default async function DemoLandingPage() {
  const links = siteLinks();
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase.rpc("demo_departments");
  const departments = (data ?? []) as DemoDepartment[];

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-5xl gap-8 px-5 py-12 sm:px-8">
      <header className="grid gap-4">
        <Link className="w-fit text-sm" href="/">사수</Link>
        <p className="m-0 text-sm font-bold text-[var(--accent)]">게스트 모드 · 읽기 전용</p>
        <h1 className="m-0 text-4xl sm:text-5xl">부서가 다르면 답도 달라집니다</h1>
        <p className="m-0 max-w-2xl text-lg leading-8 text-[var(--muted)]">
          온새미로 주식회사의 합성 데이터로 대시보드, 결정 카드, 원장, 권한 기반 Q&A를 둘러보세요.
        </p>
      </header>

      {error || departments.length === 0 ? (
        <section className="rounded-3xl bg-[var(--surface)] p-6 shadow-sm">
          <h2 className="m-0 text-2xl">데모를 준비하는 중입니다</h2>
          <p className="mb-0 text-[var(--muted)]">잠시 후 다시 접속해주세요.</p>
        </section>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2" aria-label="데모 부서 선택">
          {departments.map((department) => (
            <Link
              key={department.id}
              className="grid gap-3 rounded-3xl bg-[var(--surface)] p-6 shadow-sm transition hover:-translate-y-0.5"
              href={`/demo/d/${department.id}`}
            >
              <span className="text-sm text-[var(--muted)]">합성 워크스페이스</span>
              <strong className="text-2xl">{department.name}</strong>
              <span className="text-[var(--accent)]">대시보드 열기 →</span>
            </Link>
          ))}
        </section>
      )}

      {orgAdminReadEnabled() ? <Link href="/demo/admin" className="rounded-2xl border border-accent/20 bg-surface p-6">조직 단위로 보기 →</Link> : null}
      {trailerPublishEnabled() ? <Link href="/demo/d/cccccccc-cccc-4ccc-8ccc-cccccccccccc/trailers" className="rounded-2xl border border-accent/20 bg-surface p-6">채용 예고편 만드는 과정 →</Link> : null}

      <footer className="grid gap-5 border-t border-black/10 pt-8 text-sm text-[var(--muted)]">
        <p className="m-0">게스트 모드에서는 질문을 새로 저장하거나 외부 AI를 호출하지 않습니다.</p>
        <SiteCta compact links={links} showHome />
      </footer>
    </main>
  );
}
