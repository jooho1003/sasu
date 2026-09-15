import { notFound } from "next/navigation";
import { trailerPublishEnabled, trailerScoresMode } from "@/lib/features";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { TrailerOriginals, TrailerReadOnly } from "@/components/trailers/views";
import { parsedTrailer, trailerOriginals, readTrailerAttempts } from "@/app/(auth)/d/[dept]/trailers/_data";
import { AttemptScores } from "@/components/trailers/attempt-scores";
import { AdminTabs } from "@/components/admin/actions";
export const revalidate = 60;
export default async function DemoTrailersPage({ params }: { params: Promise<{ dept: string }> }) {
  if (!trailerPublishEnabled()) notFound(); const { dept } = await params;
  const client = createPublicSupabaseClient();
  const result = await client.from("trailers").select("id,source_decision_ids,scenarios,gate_report,approved_item_ids,slug").eq("dept_id", dept).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) return <p className="p-6" role="alert">예고편을 불러오지 못했습니다. 새로고침해 주세요.</p>;
  if (!result.data) return <p className="p-6">이 부서에는 데모 예고편이 없습니다.</p>;
  const sources = await trailerOriginals(client, dept, result.data.source_decision_ids);
  const parsed = parsedTrailer(result.data);
  const mode=trailerScoresMode(),attempts=mode!=="off"?await readTrailerAttempts(client,result.data.id):[];
  const review=<div className="grid items-start gap-5 lg:grid-cols-2">{sources ? <TrailerOriginals {...sources} /> : <p>원문을 불러오지 못했습니다.</p>}<TrailerReadOnly scenarios={parsed.scenarios} report={parsed.gate_report} approvedCount={result.data.approved_item_ids.length} slug={result.data.slug} /></div>;
  return <main className="mx-auto grid w-full max-w-7xl gap-6 p-5 sm:p-8"><p className="m-0 text-sm font-bold text-accent">게스트 모드 · 읽기 전용 · 합성 사례</p><h1 className="m-0 text-3xl">채용 예고편 만드는 과정</h1>{mode!=="off"&&attempts?.length?<AdminTabs tabs={[{label:"가상화 과정",content:review},{label:"합성 지원자 점수표",content:<AttemptScores attempts={attempts} scenarios={parsed.scenarios} mode={mode}/>}]}/>:review}{attempts===null?<p role="status">채점 결과를 불러오지 못했습니다.</p>:null}</main>;
}
