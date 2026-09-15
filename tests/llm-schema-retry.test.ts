import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
const mocks=vi.hoisted(()=>{class ApiError extends Error{constructor(public status:number){super("synthetic provider validation failure");}}return{ApiError,create:vi.fn(),insert:vi.fn()};});
vi.mock("groq-sdk",()=>({default:class{chat={completions:{create:mocks.create}};},APIError:mocks.ApiError,APIConnectionError:class extends Error{},APIConnectionTimeoutError:class extends Error{}}));
vi.mock("@/lib/supabase/service",()=>({createServiceSupabaseClient:()=>({from:()=>({insert:mocks.insert})})}));
import { llm } from "@/lib/llm";
const schema=z.strictObject({answer:z.string()}),prompt={system:"합성 테스트",user:"합성 입력"};
describe("LLM 공급자 스키마 실패 재시도",()=>{
  beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("GROQ_API_KEY","synthetic-test-key");mocks.insert.mockResolvedValue({error:null});});
  it("HTTP 스키마 거부도 한 번 재시도하고 매 호출을 기록",async()=>{mocks.create.mockRejectedValueOnce(new mocks.ApiError(400)).mockResolvedValueOnce({choices:[{message:{content:'{"answer":"합성 답"}'}}],usage:{prompt_tokens:1,completion_tokens:1}});expect((await llm.structured("trailer_score",schema,prompt)).data.answer).toBe("합성 답");expect(mocks.create).toHaveBeenCalledTimes(2);expect(mocks.insert).toHaveBeenCalledTimes(2);});
  it("반복 거부는 2회 후 안전한 오류만 반환",async()=>{mocks.create.mockRejectedValue(new mocks.ApiError(422));await expect(llm.structured("trailer_score",schema,prompt)).rejects.toMatchObject({error_code:"schema_invalid"});expect(mocks.create).toHaveBeenCalledTimes(2);});
  it("인증 오류는 재시도하지 않음",async()=>{mocks.create.mockRejectedValue(new mocks.ApiError(401));await expect(llm.structured("trailer_score",schema,prompt)).rejects.toMatchObject({error_code:"auth"});expect(mocks.create).toHaveBeenCalledOnce();});
});
