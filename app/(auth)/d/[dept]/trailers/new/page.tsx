import Link from "next/link";
import { TrailerCreate } from "@/components/trailers/forms";
import { trailerPageContext } from "../_data";
export default async function NewTrailerPage({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params; const { membership, supabase } = await trailerPageContext(dept, "/new");
  if (membership.role !== "lead") return <p>팀장만 볼 수 있습니다.</p>;
  const result = await supabase.rpc("trailer_candidates", { p_dept: dept });
  return <main className="mx-auto grid w-full max-w-5xl gap-6 p-5 sm:p-8"><Link href={`/d/${dept}/trailers`}>← 예고편 목록</Link><h1 className="m-0 text-3xl">새 예고편</h1>{result.error || !Array.isArray(result.data) ? <p role="alert">결정 목록을 불러오지 못했습니다. 새로고침해 주세요.</p> : <TrailerCreate deptId={dept} candidates={result.data} />}</main>;
}
