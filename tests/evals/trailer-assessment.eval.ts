import { afterAll, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
const state=vi.hoisted(()=>({calls:0}));
vi.mock("@/lib/supabase/service",()=>({createServiceSupabaseClient:()=>({from(table:string){if(table!=="llm_calls")throw new Error("unexpected_eval_table");return{insert:async()=>{state.calls++;return{error:null};}};}})}));
import { trailerScenarios } from "@/fixtures/trailer/scenarios";
import { TrailerScoreDraft } from "@/lib/contracts";
import { DEFAULT_TRAILER_RUBRIC } from "@/lib/trailer-generation";
import { buildSyntheticAttempts, buildTraitVariantPair } from "@/lib/trailer-synthetic";
import { ASSESSMENT_FORBIDDEN_WORDS, buildTrailerScorePrompt, verifyTrailerScore } from "@/lib/trailer-assessment";
import { weightedScore } from "@/lib/agent-role";
import { llm } from "@/lib/llm";
loadEnvConfig(process.cwd());
const available=Boolean(process.env.GROQ_API_KEY);
const trailerId="22222222-2222-4222-8222-222222222222";
const attempts=[...buildSyntheticAttempts(trailerId,trailerScenarios),...buildTraitVariantPair(trailerId,trailerScenarios)];
const rows:{label:string;total:number|null;criteria:{key:string;score:number|null;evidenceCount:number}[];validEvidence:boolean;rawForbiddenCount:number;verifiedForbiddenCount:number;schemaOnly:boolean;inputTokens:number;outputTokens:number}[]=[];
const countWords=(value:unknown)=>{const text=JSON.stringify(value);return ASSESSMENT_FORBIDDEN_WORDS.reduce((sum,word)=>sum+text.split(word).length-1,0);};
it.skipIf(!available).each(attempts)("$label 실제 합성 채점",async(attempt)=>{
  const input={rubric:DEFAULT_TRAILER_RUBRIC,scenarios:trailerScenarios,submissions:attempt.submissions};
  const output=await llm.structured("trailer_score",TrailerScoreDraft,buildTrailerScorePrompt(input));
  const result=verifyTrailerScore(output.data,input);const total=weightedScore(result.criteria.map(c=>({...c,evidence:c.evidence_status})));
  const validEvidence=result.criteria.filter(c=>c.evidence_status==="ok").every(c=>c.evidence.length>0&&c.evidence.every(e=>{const s=attempt.submissions.find(s=>s.scenario_id===e.scenario_id);return !!s&&(e.kind==="reason_quote"?!!e.quote&&s.reason.includes(e.quote):e.kind==="event"?s.events.some(event=>event.seq===e.seq):!!e.fact_id&&s.fact_ids.includes(e.fact_id));}));
  const row={label:attempt.label,total,criteria:result.criteria.map(c=>({key:c.key,score:c.score,evidenceCount:c.evidence.length})),validEvidence,rawForbiddenCount:countWords(output.data),verifiedForbiddenCount:countWords(result),schemaOnly:Object.keys(result).sort().join(",")==="criteria,interview_questions,rubric_snapshot"&&TrailerScoreDraft.safeParse(output.data).success,inputTokens:output.meta.inputTokens,outputTokens:output.meta.outputTokens};rows.push(row);
  expect(validEvidence).toBe(true);expect(total!==null).toBe(true);expect(row.verifiedForbiddenCount).toBe(0);expect(row.schemaOnly).toBe(true);
});
afterAll(()=>{
  const a=rows.find(r=>r.label==="특성 변형 A"),b=rows.find(r=>r.label==="특성 변형 B");const difference=a?.total==null||b?.total==null?null:Math.abs(a.total-b.total);
  const report={generatedAt:new Date().toISOString(),synthetic:true,databaseWrites:0,telemetryMocked:true,model:"openai/gpt-oss-120b",status:available?"executed":"skipped_missing_key",calls:state.calls,rows,checks:{validEvidence:rows.length===5&&rows.every(r=>r.validEvidence),forbiddenAfter:rows.reduce((sum,r)=>sum+r.verifiedForbiddenCount,0),traitDifference:difference,traitPass:difference!==null&&difference<=0.5,schemaOnly:rows.length===5&&rows.every(r=>r.schemaOnly)}};
  mkdirSync("docs/verification/evaluation-results",{recursive:true});writeFileSync(`docs/verification/evaluation-results/trailer-assessment-${report.generatedAt.replace(/[:.]/g,"-")}.json`,`${JSON.stringify(report,null,2)}\n`);
  if(available){expect(rows.length).toBe(5);expect(report.checks.traitPass).toBe(true);}
});
