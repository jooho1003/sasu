import Link from "next/link";
import { TrailerList } from "@/components/trailers/forms";
import { trailerPageContext, parsedTrailer } from "./_data";
export default async function TrailersPage({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params; const { membership, supabase } = await trailerPageContext(dept);
  if (membership.role !== "lead") return <p>팀장만 볼 수 있습니다.</p>;
  const [rows, candidates] = await Promise.all([supabase.from("trailers").select("id,status,status_reason,scenarios,slug,updated_at").eq("dept_id", dept).order("created_at", { ascending: false }), supabase.rpc("trailer_candidates", { p_dept: dept })]);
  return <main className="mx-auto grid w-full max-w-6xl gap-6 p-5 sm:p-8"><Link href={`/d/${dept}`} className="text-sm text-muted">← 부서로</Link><h1 className="m-0 text-3xl">채용 예고편</h1>{rows.error || candidates.error ? <p role="alert">예고편을 불러오지 못했습니다. 새로고침해 주세요.</p> : <TrailerList deptId={dept} initial={(rows.data ?? []).map((row) => ({ ...row, title: parsedTrailer(row).scenarios[0]?.title ?? "새 예고편" }))} hasCandidates={Array.isArray(candidates.data) && candidates.data.length > 0} />}</main>;
}
