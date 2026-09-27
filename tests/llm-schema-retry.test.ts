import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
const mocks=vi.hoisted(()=>{class ApiError extends Error{constructor(public status:number){super("synthetic provider validation failure");}}return{ApiError,create:vi.fn(),insert:vi.fn()};});
vi.mock("groq-sdk",()=>({default:class{chat={completions:{create:mocks.create}};},APIError:mocks.ApiError,APIConnectionError:class extends Error{},APIConnectionTimeoutError:class extends Error{}}));
vi.mock("@/lib/supabase/service",()=>({createServiceSupabaseClient:()=>({from:()=>({insert:mocks.insert})})}));
import { llm, PLAIN_LANGUAGE_INSTRUCTION, GENERATED_PROSE_INSTRUCTION } from "@/lib/llm";
import { AnswerDraft } from "@/lib/contracts";
const schema=z.strictObject({answer:z.string()}),prompt={system:"합성 테스트",user:"합성 입력"};
describe("LLM 공급자 스키마 실패 재시도",()=>{
  beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("GROQ_API_KEY","synthetic-test-key");mocks.insert.mockResolvedValue({error:null});});
  it.each(["make_card", "summarize_document"] as const)("%s의 새 문장에만 구체적인 쉬운말 지시를 더한다", async purpose => {
    mocks.create.mockResolvedValue({choices:[{message:{content:'{"answer":"합성 답"}'}}],usage:{prompt_tokens:1,completion_tokens:1}});
    await llm.structured(purpose,schema,prompt);
    expect(typeof GENERATED_PROSE_INSTRUCTION).toBe("string");
    expect(mocks.create.mock.calls[0][0].messages[0].content).toContain(GENERATED_PROSE_INSTRUCTION);
    expect(GENERATED_PROSE_INSTRUCTION).toContain("보류");
    expect(GENERATED_PROSE_INSTRUCTION).toContain("명시");
    expect(GENERATED_PROSE_INSTRUCTION).toContain("quote");
    expect(GENERATED_PROSE_INSTRUCTION).toContain("원문 복사");
  });
  it.each(["answer", "classify", "trailer_generate", "retro_draft"] as const)("%s 계약과 원문 선택에 생성 문장 전용 지시를 섞지 않는다", async purpose => {
    mocks.create.mockResolvedValue({choices:[{message:{content:'{"answer":"합성 답"}'}}],usage:{prompt_tokens:1,completion_tokens:1}});
    await llm.structured(purpose,schema,prompt);
    expect(typeof GENERATED_PROSE_INSTRUCTION).toBe("string");
    expect(mocks.create.mock.calls[0][0].messages[0].content).not.toContain(GENERATED_PROSE_INSTRUCTION);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("문체 위반을 이유로 실패·추가 호출·원문 치환을 하지 않는다", async () => {
    const original = { text: "보류 사유를 명시합니다. " + "긴 설명".repeat(20), quote: "부서장이 계약 갱신을 보류했습니다." };
    mocks.create.mockResolvedValue({choices:[{message:{content:JSON.stringify(original)}}],usage:{prompt_tokens:1,completion_tokens:1}});
    const result = await llm.structured("make_card", z.strictObject({text:z.string(),quote:z.string()}), prompt);
    expect(result.data).toEqual(original);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("모든 생성 요청에 쉬운말과 원문 보존 규칙을 적용한다",async()=>{
    mocks.create.mockResolvedValue({choices:[{message:{content:'{"answer":"합성 답"}'}}],usage:{prompt_tokens:1,completion_tokens:1}});
    await llm.structured("answer",schema,prompt);
    expect(mocks.create.mock.calls[0][0].messages[0].content).toContain(PLAIN_LANGUAGE_INSTRUCTION);
    expect(PLAIN_LANGUAGE_INSTRUCTION).toContain('40자');expect(PLAIN_LANGUAGE_INSTRUCTION).toContain('quote');
  });
  it("HTTP 스키마 거부도 한 번 재시도하고 매 호출을 기록",async()=>{mocks.create.mockRejectedValueOnce(new mocks.ApiError(400)).mockResolvedValueOnce({choices:[{message:{content:'{"answer":"합성 답"}'}}],usage:{prompt_tokens:1,completion_tokens:1}});expect((await llm.structured("trailer_score",schema,prompt)).data.answer).toBe("합성 답");expect(mocks.create).toHaveBeenCalledTimes(2);expect(mocks.insert).toHaveBeenCalledTimes(2);});
  it("반복 거부는 2회 후 안전한 오류만 반환",async()=>{mocks.create.mockRejectedValue(new mocks.ApiError(422));await expect(llm.structured("trailer_score",schema,prompt)).rejects.toMatchObject({error_code:"schema_invalid"});expect(mocks.create).toHaveBeenCalledTimes(2);});
  it("ASK의 유효한 빈 인용 거절은 llm_refusal로 분류한다", async () => {
    mocks.create.mockResolvedValue({choices:[{message:{content:JSON.stringify({citations:[],refused:true,refusal_reason:null})}}],usage:{prompt_tokens:1,completion_tokens:1}});
    await expect(llm.structured("answer",AnswerDraft,prompt)).rejects.toMatchObject({error_code:"llm_refusal"});
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
  it("ASK의 필수 필드가 빠진 거절 형태는 schema_invalid로 분류한다", async () => {
    mocks.create.mockResolvedValue({choices:[{message:{content:JSON.stringify({citations:[]})}}],usage:{prompt_tokens:1,completion_tokens:1}});
    await expect(llm.structured("answer",AnswerDraft,prompt)).rejects.toMatchObject({error_code:"schema_invalid"});
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
  it("ASK의 공급자 스키마 거부는 근거 부족으로 분류하지 않는다", async () => {
    mocks.create.mockRejectedValue(new mocks.ApiError(422));
    await expect(llm.structured("answer",AnswerDraft,prompt)).rejects.toMatchObject({error_code:"schema_invalid"});
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
  it("인증 오류는 재시도하지 않음",async()=>{mocks.create.mockRejectedValue(new mocks.ApiError(401));await expect(llm.structured("trailer_score",schema,prompt)).rejects.toMatchObject({error_code:"auth"});expect(mocks.create).toHaveBeenCalledOnce();});
  it("사용 한도는 스키마 오류로 분류하거나 재시도하지 않는다",async()=>{const error=new mocks.ApiError(400);Reflect.set(error,"error",{error:{code:"spend_limit_reached"}});mocks.create.mockRejectedValue(error);await expect(llm.structured("answer",schema,prompt)).rejects.toMatchObject({error_code:"llm_budget_exceeded"});expect(mocks.create).toHaveBeenCalledOnce();});
});
