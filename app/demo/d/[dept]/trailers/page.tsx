import { DemoCandidateConsent, DemoTrailerInvites } from "@/components/demo-trailer-invites";
import { RecruitmentTrailer } from "@/components/recruitment-trailer";
import { trailerScenarios } from "@/fixtures/trailer/scenarios";
import { trailerScoresMode } from "@/lib/features";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { TrailerOriginals, TrailerReadOnly } from "@/components/trailers/views";
import { parsedTrailer, trailerOriginals, readTrailerAttempts } from "@/app/(auth)/d/[dept]/trailers/_data";
import { AttemptScores } from "@/components/trailers/attempt-scores";
import { AdminTabs } from "@/components/admin/actions";
export const revalidate = 60;
export default async function DemoTrailersPage({ params, searchParams }: { params: Promise<{ dept: string }>; searchParams: Promise<{ candidate?: string }> }) {
  const { dept } = await params;
  const query = await searchParams;
  const candidate = query.candidate && /^[ABC]$/.test(query.candidate) ? query.candidate : null;
  const play = <><DemoTrailerInvites dept={dept} /><DemoCandidateConsent key={candidate} candidate={candidate}><section aria-label="예고편 바로 체험"><RecruitmentTrailer scenarios={trailerScenarios} notice="합성 예고편 · 브라우저 안에서 결정과 근거를 직접 선택하세요." /></section></DemoCandidateConsent></>;
  const client = createPublicSupabaseClient();
  const result = await client.from("trailers").select("id,source_decision_ids,scenarios,gate_report,approved_item_ids,slug").eq("dept_id", dept).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) return <main className="workspace-page"><h1>채용 예고편</h1>{play}<p role="status">공개 검토 이력은 불러오지 못했습니다. 합성 예고편은 체험할 수 있습니다.</p></main>;
  if (!result.data) return <main className="workspace-page"><h1>채용 예고편</h1>{play}</main>;
  const sources = await trailerOriginals(client, dept, result.data.source_decision_ids);
  const parsed = parsedTrailer(result.data);
  const mode=trailerScoresMode(),attempts=mode!=="off"?await readTrailerAttempts(client,result.data.id):[];
  const review=<div className="grid items-start gap-5 lg:grid-cols-2">{sources ? <TrailerOriginals {...sources} /> : <p>원문을 불러오지 못했습니다.</p>}<TrailerReadOnly scenarios={parsed.scenarios} report={parsed.gate_report} approvedCount={result.data.approved_item_ids.length} slug={result.data.slug} /></div>;
  return <main className="mx-auto grid w-full max-w-7xl gap-6 p-5 sm:p-8"><p className="m-0 text-sm font-bold text-accent">게스트 모드 · 읽기 전용 · 합성 사례</p><h1 className="m-0 text-3xl">채용 예고편</h1>{play}<details><summary>예고편 만드는 과정과 공개 검토 이력</summary>{mode!=="off"&&attempts?.length?<AdminTabs tabs={[{label:"가상화 과정",content:review},{label:"합성 지원자 점수표",content:<AttemptScores attempts={attempts} scenarios={parsed.scenarios} mode={mode}/>}]}/>:review}{attempts===null?<p role="status">채점 결과를 불러오지 못했습니다.</p>:null}</details></main>;
}
