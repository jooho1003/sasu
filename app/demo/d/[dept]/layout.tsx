import Link from "next/link";
import { notFound } from "next/navigation";

import { createPublicSupabaseClient } from "@/lib/supabase/public";

export default async function DemoDepartmentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
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
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
