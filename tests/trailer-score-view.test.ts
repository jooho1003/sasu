import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AttemptScores, type AttemptScoreRow } from "@/components/trailers/attempt-scores";
import { trailerScenarios } from "@/fixtures/trailer/scenarios";
import { buildSyntheticAttempts } from "@/lib/trailer-synthetic";
import { verifyTrailerScore, ASSESSMENT_FIXED_COPY } from "@/lib/trailer-assessment";
const rubric=[{key:"evidence",label:"근거",description:"확인",weight:3}];
function rows():AttemptScoreRow[]{return buildSyntheticAttempts("t",trailerScenarios).map((a,i)=>({...a,createdAt:`2026-09-15T00:00:0${i}Z`,status:"scored",weightedScore:i,result:verifyTrailerScore({criteria:[{key:"evidence",score:i,rationale:"확인한 사실이 있습니다.",evidence:[{scenario_id:trailerScenarios[0].id,kind:"event",seq:1,quote:null,fact_id:null}]}],interview_questions:[{question:"그 사실이 선택에 어떤 영향을 주었나요?",basis:[{scenario_id:trailerScenarios[0].id,kind:"event",seq:1,ref:null,quote:null}]}]},{rubric,scenarios:trailerScenarios,submissions:a.submissions})}));}
describe("합성 점수표 렌더 경계",()=>{
  it("기본 제출순이며 접힘·고정 안내를 유지",()=>{const html=renderToStaticMarkup(createElement(AttemptScores,{attempts:rows().reverse(),scenarios:trailerScenarios,mode:"full"}));expect(html.indexOf('data-attempt-label="합성 지원자 A"')).toBeLessThan(html.indexOf('data-attempt-label="합성 지원자 B"'));expect(html).not.toContain("<details open");for(const copy of ASSESSMENT_FIXED_COPY)expect(html).toContain(copy);expect(html).toContain('aria-label="면접 확인 질문"');});
  it("scores 모드에는 질문 DOM이 없고 다른 시나리오 제출은 표시 안 함",()=>{const html=renderToStaticMarkup(createElement(AttemptScores,{attempts:rows(),scenarios:trailerScenarios,mode:"scores"}));expect(html).not.toContain("면접 확인 질문");const attempts=rows();attempts[0].submissions[0].scenario_id="missing";const bad=renderToStaticMarkup(createElement(AttemptScores,{attempts,scenarios:trailerScenarios,mode:"full"}));expect(bad).toContain("표시할 수 없는 채점 결과");expect(bad).not.toContain('data-attempt-label="합성 지원자 A"');});
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
it("실제 지원자는 제출순 고정이며 이메일과 재채점 버튼만 추가한다", () => { const attempts=rows().reverse().map(r=>({...r,status:"failed" as const,email:"candidate@example.com"})); const html=renderToStaticMarkup(createElement(AttemptScores,{attempts,scenarios:trailerScenarios,mode:"scores",kind:"candidate",rescoreBase:"/api/rescore"})); expect(html).toContain("지원자 제출 점수표"); expect(html).not.toContain("점수순으로 보기"); expect(html).toContain("candidate@example.com"); expect(html).toContain("다시 채점"); expect(html.indexOf("합성 지원자 A")).toBeLessThan(html.indexOf("합성 지원자 B")); });
