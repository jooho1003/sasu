import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(() => ({ rpc:vi.fn(), kick:vi.fn() }));
vi.mock("@/lib/supabase/membership",()=>({requireMembership:async()=>({deptId:"session-dept",userId:"session-user"})}));
vi.mock("@/lib/supabase/server",()=>({createServerSupabaseClient:async()=>mocks}));
vi.mock("@/lib/jobs",()=>({kickWorker:mocks.kick}));
import { GET, POST } from "@/app/api/d/[dept]/slack-questions/route";
const ctx={params:Promise.resolve({dept:"url-dept"})};
const request=(body:unknown)=>new Request("http://localhost",{method:"POST",body:JSON.stringify(body)});
describe("내 Slack 질문 API",()=>{
  beforeEach(()=>{ vi.resetAllMocks();mocks.rpc.mockResolvedValue({data:true,error:null}); });
  it("GET은 세션 검증된 부서와 사용자 RPC를 사용한다",async()=>{
    mocks.rpc.mockResolvedValue({data:[],error:null});
    expect((await GET(new Request("http://localhost"),ctx)).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("my_slack_questions",{p_dept:"session-dept"});
  });
  it("재전송은 본문의 부서·질문자·내용을 사용하지 않는다",async()=>{
    expect((await POST(request({answerId:"11111111-1111-4111-8111-111111111111",dept_id:"forged",asked_by:"forged",answer:"forged"}),ctx)).status).toBe(202);
    expect(mocks.rpc).toHaveBeenCalledWith("retry_my_slack_answer",{p_dept:"session-dept",p_answer:"11111111-1111-4111-8111-111111111111"});
    expect(mocks.kick).toHaveBeenCalledOnce();
  });
  it("권한 거부·중복은 워커를 실행하지 않는다",async()=>{
    mocks.rpc.mockResolvedValueOnce({data:null,error:{code:"42501"}});
    expect((await POST(request({answerId:"11111111-1111-4111-8111-111111111111"}),ctx)).status).toBe(403);
    mocks.rpc.mockResolvedValueOnce({data:false,error:null});
    expect((await POST(request({answerId:"11111111-1111-4111-8111-111111111111"}),ctx)).status).toBe(409);
    expect(mocks.kick).not.toHaveBeenCalled();
  });
});
