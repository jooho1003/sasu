import Link from "next/link";

import { createPublicSupabaseClient } from "@/lib/supabase/public";

type Answer = { id: string; question_key: string; question: string; answer: string | null; generic_answer: string | null };
type Citation = { owner_id: string; quote: string };

export default async function DemoAskPage({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  const supabase = createPublicSupabaseClient();
  const { data: answers, error: answersError } = await supabase.from("answers").select("id, question_key, question, answer, generic_answer").eq("dept_id", dept).eq("status", "done").order("created_at", { ascending: true });
  if (answersError) throw new Error("게스트 답변 조회 실패");
  const rows = (answers ?? []) as Answer[];
  const { data: citations, error: citationsError } = rows.length ? await supabase.from("citations").select("owner_id, quote").eq("owner_kind", "answer").in("owner_id", rows.map((row) => row.id)) : { data: [] as Citation[], error: null };
  if (citationsError) throw new Error("게스트 답변 근거 조회 실패");
  const citationMap = new Map(((citations ?? []) as Citation[]).map((citation) => [citation.owner_id, citation.quote]));
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-10 sm:px-8">
      <div><p className="m-0 text-sm text-[var(--muted)]">S4 · ASK</p><h1 className="m-0 text-4xl">사수에게 묻기</h1><p className="mb-0 mt-2 text-[var(--muted)]">준비된 질문으로 부서 근거와 범용 AI 답을 비교해보세요.</p></div>
      <div className="grid gap-4">{rows.length === 0 ? <p className="m-0 rounded-2xl border border-dashed border-black/20 p-6 text-[var(--muted)]">아직 준비된 질문과 답변이 없습니다.</p> : rows.map((row) => <article key={row.id} className="grid gap-4 rounded-3xl bg-[var(--surface)] p-6 shadow-sm"><h2 className="m-0 text-xl">{row.question}</h2><div className="grid gap-3 lg:grid-cols-2"><section className="grid gap-2 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4"><span className="text-sm font-bold text-[var(--accent)]">사수의 답 · 부서 근거</span><p className="m-0 leading-7">{row.answer ?? "답변이 없습니다."}</p><q className="text-sm text-[var(--muted)]">{citationMap.get(row.id) ?? "인용 없음"}</q></section><section className="grid gap-2 rounded-2xl border border-black/10 p-4"><span className="text-sm font-bold text-[var(--muted)]">범용 AI의 답</span><p className="m-0 leading-7">{row.generic_answer ?? "준비된 범용 답변이 없습니다."}</p></section></div><p className="m-0 text-xs text-[var(--muted)]">게스트 데모는 시드한 응답을 읽으며, 새 질문을 저장하거나 LLM을 호출하지 않습니다.</p></article>)}</div>
      <section className="grid gap-2 rounded-2xl border border-dashed border-black/20 p-5"><h2 className="m-0 text-xl">자유 질문</h2><p className="m-0 text-[var(--muted)]">게스트에서는 준비된 질문만 열람할 수 있습니다. 실제 부서의 권한 인지 Q&A는 로그인 후 이용하세요.</p><Link className="w-fit" href="/#pilot">우리 팀에 적용하기 →</Link></section>
    </main>
  );
}
