import { describe, expect, it } from "vitest";
import fixture from "./fixtures/trailer-approval.json";
import { TrailerScenario } from "@/lib/contracts";
import { buildSyntheticAttempts, buildTraitVariantPair, syntheticAttemptId } from "@/lib/trailer-synthetic";
import { validateAttemptSubmissions } from "@/lib/trailer-assessment";
import { trailerScenarios } from "@/fixtures/trailer/scenarios";
const scenarios=TrailerScenario.array().parse(fixture.scenarios),id="22222222-2222-4222-8222-222222222222";
describe("합성 지원자 생성",()=>{
  it("기존 3개 공간 체험 사례에도 적용된다",()=>{for(const attempt of buildSyntheticAttempts(id,trailerScenarios))expect(validateAttemptSubmissions(trailerScenarios,attempt.submissions)).toEqual(attempt.submissions);});
  it("모든 사례에 검증 가능한 A·B·C와 결정적 UUID를 만듦",()=>{const attempts=buildSyntheticAttempts(id,scenarios);expect(attempts.map(a=>a.label)).toEqual(["합성 지원자 A","합성 지원자 B","합성 지원자 C"]);expect(buildSyntheticAttempts(id,scenarios)).toEqual(attempts);for(const a of attempts){expect(validateAttemptSubmissions(scenarios,a.submissions)).toEqual(a.submissions);expect(a.id).toMatch(/^[a-f0-9-]{14}5[a-f0-9-]+$/);expect(JSON.stringify(a)).not.toMatch(/\d+대|여성|남성|학교/u);}expect(syntheticAttemptId(id,"A")).not.toBe(syntheticAttemptId(id,"B"));});
  it("특성 변형은 행동을 유지하고 서두만 다름",()=>{const [a,b]=buildTraitVariantPair(id,scenarios);for(let i=0;i<scenarios.length;i++){expect({...a.submissions[i],reason:""}).toEqual({...b.submissions[i],reason:""});expect(a.submissions[i].reason.split("\n").slice(1)).toEqual(b.submissions[i].reason.split("\n").slice(1));}});
});
