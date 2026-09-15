import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/trailer-approval.json";
import { TrailerScenario } from "@/lib/contracts";
import { buildSyntheticAttempts } from "@/lib/trailer-synthetic";
const mocks=vi.hoisted(()=>({client:null as unknown,structured:vi.fn(),register:vi.fn()}));
vi.mock("@/lib/supabase/service",()=>({createServiceSupabaseClient:()=>mocks.client}));
vi.mock("@/lib/llm",()=>({llm:{structured:mocks.structured}}));
vi.mock("@/lib/jobs",()=>({registerHandler:mocks.register}));
import { scoreTrailerAttempt } from "@/lib/pipeline/trailer-score";
const scenarios=TrailerScenario.array().parse(fixture.scenarios),submissions=buildSyntheticAttempts("t",scenarios)[0].submissions;
function setup(status="scoring",version=1){const writes:Record<string,unknown>[]=[],filters:unknown[]=[];mocks.client={from:(table:string)=>{const q={select:()=>q,eq:(key:string,value:unknown)=>{filters.push([key,value]);return q;},update:(value:Record<string,unknown>)=>{writes.push(value);return q;},maybeSingle:async()=>({data:table==="trailer_attempts"?{id:"a",trailer_id:"t",dept_id:"dept",status,updated_at:"v1",submissions}:{scenarios,rubric:[{key:"evidence",label:"근거",description:"확인",weight:3}],schema_version:version},error:null}),then:(resolve:(value:unknown)=>void)=>resolve({error:null})};return q;}};return{writes,filters};}
describe("합성 채점 워커",()=>{
  beforeEach(()=>{vi.resetAllMocks();mocks.structured.mockResolvedValue({data:{criteria:[{key:"evidence",score:4,rationale:"확인한 사실이 있습니다.",evidence:[{scenario_id:scenarios[0].id,kind:"event",seq:1,quote:null,fact_id:null}]}],interview_questions:[]}});});
  it("유효 근거는 코드 총점과 읽은 버전으로 조건부 저장",async()=>{const f=setup();await scoreTrailerAttempt("a");expect(f.writes[0]).toMatchObject({status:"scored",weighted_score:4});expect(f.filters).toContainEqual(["updated_at","v1"]);expect(mocks.structured).toHaveBeenCalledOnce();});
  it("근거가 없으면 citation_invalid",async()=>{const f=setup();mocks.structured.mockResolvedValue({data:{criteria:[],interview_questions:[]}});await scoreTrailerAttempt("a");expect(f.writes[0]).toMatchObject({status:"failed",status_reason:"citation_invalid"});});
  it("완료된 상태는 호출하지 않고 새 스키마는 실패",async()=>{setup("scored");await scoreTrailerAttempt("a");expect(mocks.structured).not.toHaveBeenCalled();setup("scoring",2);await expect(scoreTrailerAttempt("a")).rejects.toMatchObject({error_code:"attempt_invalid"});});
});
