import { notFound } from "next/navigation";

import { createPublicSupabaseClient } from "@/lib/supabase/public";

type Criterion = { key: string; label: string; description: string; weight: number };
type Citation = { item_id: string | null; decision_id: string | null; quote: string };
type ResultCriterion = {
  key: string;
  label: string;
  score: number | null;
  rationale: string | null;
  citations: Citation[];
  evidence: "ok" | "no_evidence";
};
type Result = { criteria: ResultCriterion[]; summary: string };
type AgentRole = { id: string; name: string; instruction: string; criteria: Criterion[] };
type AgentRoleResult = { id: string; source_id: string; status: string; result: Result | null; weighted_score: number | null };
type Source = { id: string; title: string | null };

export default async function DemoRolesPage({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  const supabase = createPublicSupabaseClient();
  const { data: department } = await supabase.from("departments").select("id, name").eq("id", dept).maybeSingle<{ id: string; name: string }>();
  if (!department) notFound();

  const { data: roleRows, error: roleError } = await supabase
    .from("agent_roles")
    .select("id, name, instruction, criteria")
    .eq("dept_id", dept)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (roleError) throw new Error("게스트 역할 조회 실패");

  const roles = (roleRows ?? []) as AgentRole[];
  if (roles.length === 0) {
    return <main className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-10 sm:px-8"><p className="m-0 text-sm text-[var(--muted)]">S8 · 부서 에이전트 역할</p><h1 className="m-0 text-4xl">문서 기준표 평가</h1><p className="rounded-2xl bg-[var(--surface)] p-6 text-[var(--muted)] shadow-sm">이 부서에는 공개된 역할과 점수표가 아직 없습니다.</p></main>;
  }

  const roleIds = roles.map((role) => role.id);
  const { data: resultRows, error: resultError } = await supabase
    .from("agent_role_results")
    .select("id, role_id, source_id, status, result, weighted_score")
    .in("role_id", roleIds)
    .eq("status", "completed")
    .order("weighted_score", { ascending: false, nullsFirst: false });
  if (resultError) throw new Error("게스트 역할 결과 조회 실패");

  const results = (resultRows ?? []) as Array<AgentRoleResult & { role_id: string }>;
  const sourceIds = [...new Set(results.map((result) => result.source_id))];
  const { data: sourceRows } = sourceIds.length === 0
    ? { data: [] as Source[] }
    : await supabase.from("sources").select("id, title").in("id", sourceIds);
  const sourceNames = new Map(((sourceRows ?? []) as Source[]).map((source) => [source.id, source.title ?? "이름 없는 문서"]));

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 sm:px-8">
      <section className="grid gap-3"><p className="m-0 text-sm font-bold text-[var(--accent)]">S8 · 부서 에이전트 역할</p><h1 className="m-0 text-4xl">문서 기준표 평가</h1><p className="m-0 text-[var(--muted)]">{department.name}의 합성 문서 평가 · 로그인 없이 읽기 전용</p><p className="m-0 rounded-xl bg-[var(--accent)]/10 p-4 font-bold text-[var(--accent)]">AI 점수는 참고용입니다. 최종 판단은 담당자가 합니다.</p><p className="m-0 text-sm text-[var(--muted)]">가중 점수 = 기준별 점수×가중치 합 ÷ 전체 가중치. 근거 없는 기준은 0점.</p></section>
      {roles.map((role) => {
        const roleResults = results.filter((result) => result.role_id === role.id);
        return <section key={role.id} className="grid gap-5 rounded-3xl bg-[var(--surface)] p-6 shadow-sm"><div className="grid gap-2"><p className="m-0 text-sm text-[var(--muted)]">평가 역할</p><h2 className="m-0 text-2xl">{role.name}</h2><p className="m-0 whitespace-pre-wrap leading-7">{role.instruction}</p></div>{roleResults.length === 0 ? <p className="m-0 rounded-2xl border border-dashed border-black/20 p-6 text-[var(--muted)]">이 역할로 완료된 문서 평가가 아직 없습니다.</p> : <><div className="overflow-x-auto"><table className="w-full min-w-200 text-sm"><thead><tr className="border-b text-left text-[var(--muted)]"><th className="p-2">문서</th><th className="p-2">가중 점수</th>{role.criteria.map((criterion) => <th key={criterion.key} className="p-2">{criterion.label}</th>)}</tr></thead><tbody>{roleResults.map((row) => { const criteria = new Map(row.result?.criteria.map((criterion) => [criterion.key, criterion]) ?? []); return <tr key={row.id} className="border-b border-black/10"><td className="p-2 font-bold">{sourceNames.get(row.source_id) ?? "이름 없는 문서"}</td><td className="p-2">{row.weighted_score?.toFixed(2) ?? "—"}</td>{role.criteria.map((criterion) => { const value = criteria.get(criterion.key); return <td key={criterion.key} className="p-2">{value?.evidence === "ok" ? value.score : "근거 없음 (0점 반영)"}</td>; })}</tr>; })}</tbody></table></div>{roleResults.map((row) => { const hasEvidence = (row.result?.criteria ?? []).some((criterion) => criterion.evidence === "ok"); return row.result ? <article key={`${row.id}-detail`} className="grid gap-4 rounded-2xl border border-black/10 p-5"><div><h3 className="m-0 text-lg">{sourceNames.get(row.source_id) ?? "이름 없는 문서"}</h3>{hasEvidence ? <p className="mb-0 mt-2 leading-7">{row.result.summary}</p> : null}</div>{row.result.criteria.map((criterion) => <section key={criterion.key} className="grid gap-2 border-t border-black/10 pt-4"><h4 className="m-0">{criterion.label} · {criterion.evidence === "ok" ? `${criterion.score}점` : "근거 없음 (0점 반영)"}</h4>{criterion.evidence === "ok" ? <><p className="m-0 leading-7">{criterion.rationale}</p>{criterion.citations.map((citation) => <q key={`${citation.item_id}-${citation.quote}`} className="w-fit rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3">{citation.quote}</q>)}</> : <p className="m-0 text-[var(--muted)]">근거 없음 (0점 반영)</p>}</section>)}</article> : null; })}</>}</section>;
      })}
    </main>
  );
}
