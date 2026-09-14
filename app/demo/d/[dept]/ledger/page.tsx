import Link from "next/link";

import { createPublicSupabaseClient } from "@/lib/supabase/public";

type Decision = { id: string; decided_by_name: string; decided_at: string | null; outcome: string; rationale: string };

export default async function DemoLedgerPage({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  const supabase = createPublicSupabaseClient();
  const { data: decisions, error } = await supabase.from("decisions").select("id, decided_by_name, decided_at, outcome, rationale").eq("dept_id", dept).order("decided_at", { ascending: false });
  if (error) throw new Error("게스트 원장 조회 실패");
  const rows = (decisions ?? []) as Decision[];
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-10 sm:px-8">
      <div><p className="m-0 text-sm text-[var(--muted)]">S3 · LEDGER</p><h1 className="m-0 text-4xl">결정 원장</h1><p className="mb-0 mt-2 text-[var(--muted)]">누가, 왜, 어떤 근거로 정했는지 남습니다.</p></div>
      <div className="grid gap-3">{rows.length === 0 ? <p className="m-0 rounded-2xl border border-dashed border-black/20 p-6 text-[var(--muted)]">아직 기록된 결정이 없습니다.</p> : rows.map((decision) => <article key={decision.id} id={`decision-${decision.id}`} className="grid gap-2 rounded-2xl bg-[var(--surface)] p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-2 text-sm text-[var(--muted)]"><span>{decision.decided_by_name}</span><span>{decision.decided_at ? new Date(decision.decided_at).toLocaleDateString("ko-KR") : "시각 미상"}</span></div><h2 className="m-0 text-xl">{decision.outcome}</h2><p className="m-0 leading-7">{decision.rationale}</p></article>)}</div>
      <Link className="w-fit" href={`/demo/d/${dept}/ask`}>이 결정의 맥락을 물어보기 →</Link>
    </main>
  );
}
