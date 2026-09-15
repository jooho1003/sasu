import { describe, expect, it } from "vitest";
import fixture from "./fixtures/trailer-approval.json";
import { parseDemoTrailerSnapshot, parseDemoAttemptsSnapshot } from "@/lib/trailer-snapshot";
import { TrailerScenario } from "@/lib/contracts";
import { buildSyntheticAttempts } from "@/lib/trailer-synthetic";
import { verifyTrailerScore } from "@/lib/trailer-assessment";
import { weightedScore } from "@/lib/agent-role";
const id = "22222222-2222-4222-8222-222222222222";
const snapshot = () => ({ schema_version: 1, dept_id: id, decision_ids: [id], scenarios: [structuredClone(fixture.scenarios[0])], gate_report: { passed: true, violations: [] }, generated_at: "2026-09-15T00:00:00Z" });
const context = { sourceTexts: [], properNouns: [], knownDecisionIds: [id] };
describe("데모 예고편 스냅샷", () => {
  it("합성 스냅샷을 재검사하고 통과", () => { expect(parseDemoTrailerSnapshot(snapshot(), context).status).toBe("ok"); });
  it("스냅샷 보고서를 믿지 않고 20자 겹침 거부", () => { const data = snapshot(); data.scenarios[0].summary = "가나다라마바사아자차카타파하가나다라마바사아자차카타파하"; expect(parseDemoTrailerSnapshot(data, { ...context, sourceTexts: [data.scenarios[0].summary] })).toEqual({ status: "invalid", reason: "overlap" }); });
  it("모르는 결정과 다른 스키마는 거부", () => { expect(parseDemoTrailerSnapshot(snapshot(), { ...context, knownDecisionIds: [] })).toEqual({ status: "invalid", reason: "decision_ids" }); expect(parseDemoTrailerSnapshot({ ...snapshot(), schema_version: 2 }, context)).toEqual({ status: "invalid", reason: "schema" }); });
  it.each(["합격", "불합격", "탈락", "추천", "적합도"])("금지어 %s는 거부", (word) => { const data = snapshot(); data.scenarios[0].title = word; expect(parseDemoTrailerSnapshot(data, context)).toEqual({ status: "invalid", reason: "forbidden_word" }); });
});

describe("합성 채점 스냅샷 재검증",()=>{
  const scenarios=TrailerScenario.array().parse(fixture.scenarios),rubric=[{key:"evidence",label:"근거",description:"확인",weight:3}];
  function data(){return {schema_version:1,trailer_id:id,attempts:buildSyntheticAttempts(id,scenarios).map(a=>{const result=verifyTrailerScore({criteria:[{key:"evidence",score:3,rationale:"확인한 사실이 있습니다.",evidence:[{scenario_id:scenarios[0].id,kind:"event",seq:1,quote:null,fact_id:null}]}],interview_questions:[]},{rubric,scenarios,submissions:a.submissions});return {...a,kind:"synthetic",status:"scored",result,weighted_score:weightedScore(result.criteria.map(c=>({...c,evidence:c.evidence_status})))};})};}
  const ctx={trailerId:id,scenarios,rubric};
  it("일치하는 id·제출·근거·총점만 통과",()=>{expect(parseDemoAttemptsSnapshot(data(),ctx).status).toBe("ok");});
  it("조작한 총점·근거·판정·id는 거부",()=>{for(const alter of [(d:ReturnType<typeof data>)=>{d.attempts[0].weighted_score=5;},(d:ReturnType<typeof data>)=>{d.attempts[0].result.criteria[0].evidence[0].seq=900;},(d:ReturnType<typeof data>)=>{d.attempts[0].result.criteria[0].rationale="추천";},(d:ReturnType<typeof data>)=>{d.attempts[0].id=id;}]){const d=data();alter(d);expect(parseDemoAttemptsSnapshot(d,ctx).status).toBe("invalid");}});
});
