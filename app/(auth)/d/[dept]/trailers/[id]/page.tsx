import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { TrailerReview } from "@/components/trailers/forms";
import { TrailerOriginals } from "@/components/trailers/views";
import { parsedTrailer, trailerOriginals, trailerPageContext, readTrailerAttempts } from "../_data";
import { trailerInvitesEnabled, trailerScoresMode } from "@/lib/features";
import { AttemptScores } from "@/components/trailers/attempt-scores";
import { AdminTabs } from "@/components/admin/actions";
export default async function TrailerReviewPage({ params }: { params: Promise<{ dept: string; id: string }> }) {
  const { dept, id } = await params; const { membership, supabase } = await trailerPageContext(dept, `/${id}`);
  if (membership.role !== "lead") return <p>부서장만 볼 수 있습니다.</p>;
  if (!z.uuid().safeParse(id).success) notFound();
  const result = await supabase.from("trailers").select("id,status,status_reason,scenarios,updated_at,gate_report,approved_item_ids,slug,unpublished_at,source_decision_ids").eq("id", id).eq("dept_id", dept).maybeSingle();
  if (result.error) return <p role="alert">예고편을 불러오지 못했습니다. 새로고침해 주세요.</p>;
  if (!result.data) notFound();
  const sources = await trailerOriginals(supabase, dept, result.data.source_decision_ids);
  const mode=trailerScoresMode(),attempts=mode!=="off"?await readTrailerAttempts(supabase,id):[];
  const review=<div className="grid items-start gap-5 lg:grid-cols-2">{sources ? <TrailerOriginals {...sources} /> : <p role="alert">원문을 불러오지 못했습니다. 새로고침해 주세요.</p>}<TrailerReview key={result.data.updated_at} deptId={dept} data={{ ...result.data, ...parsedTrailer(result.data) }} invitesEnabled={trailerInvitesEnabled()} /></div>;
  const candidateEnabled = trailerInvitesEnabled() && result.data.status === "published";
  const candidates = candidateEnabled ? await readTrailerAttempts(supabase, id, "candidate") : [];
  const tabs = [{ label: "검토·발행", content: review }];
  if (mode !== "off" && attempts?.length) tabs.push({ label: "합성 지원자 점수표", content: <AttemptScores attempts={attempts} scenarios={parsedTrailer(result.data).scenarios} mode={mode} /> });
  if (candidateEnabled) tabs.push({ label: "지원자 제출", content: candidates === null ? <p role="status">제출을 불러오지 못했습니다.</p> : <AttemptScores attempts={candidates} scenarios={parsedTrailer(result.data).scenarios} mode={mode === "off" ? "scores" : mode} kind="candidate" rescoreBase={`/api/d/${dept}/trailers/${id}/invites/attempts`} /> });
  return <main className="mx-auto grid w-full max-w-7xl gap-6 p-5 sm:p-8"><Link href={`/d/${dept}/trailers`}>← 예고편 목록</Link><h1 className="m-0 text-3xl">검토·발행</h1>{tabs.length > 1 ? <AdminTabs tabs={tabs}/> : review}{attempts===null?<p role="status">채점 결과를 불러오지 못했습니다.</p>:null}</main>;
}
