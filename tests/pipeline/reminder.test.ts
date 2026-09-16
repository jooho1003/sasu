import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),open:vi.fn(),post:vi.fn()}));
vi.mock("@/lib/supabase/service",()=>({createServiceSupabaseClient:()=>mocks}));
vi.mock("@/lib/slack/post",()=>({openDirectMessage:mocks.open,postMessage:mocks.post}));
vi.mock("@/lib/jobs",()=>({registerHandler:vi.fn()}));
import { sendCardReminder } from "@/lib/pipeline/reminder";
describe("결정 리마인드",()=>{
  beforeEach(()=>{
    vi.resetAllMocks();
    mocks.rpc.mockImplementation(async(name:string)=>({data:name==="claim_card_reminder"?{requestId:"card",deptId:"dept",slackUserId:"U1",kind:"manual"}:true,error:null}));
    mocks.open.mockResolvedValue({id:"D1"});mocks.post.mockResolvedValue({channel:"D1",ts:"1.1"});
  });
  it("현재 담당자에게 고정 안내와 웹 링크만 전송한다",async()=>{
    await sendCardReminder("reminder",2);
    expect(mocks.open).toHaveBeenCalledWith("U1");
    expect(mocks.post).toHaveBeenCalledWith(expect.objectContaining({channel:"D1",text:expect.stringContaining("결정"),mrkdwn:false}));
    expect(mocks.rpc).toHaveBeenCalledWith("finish_card_reminder",expect.objectContaining({p_generation:2,p_sent:true}));
  });
  it("동의 회수/완료/취소된 알림은 아무 메시지도 보내지 않는다",async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:null}); await sendCardReminder("reminder",2);
    expect(mocks.open).not.toHaveBeenCalled(); expect(mocks.post).not.toHaveBeenCalled();
  });
  it("전송 실패는 lease를 해제하고 작업 재시도에 맡긴다",async()=>{
    mocks.post.mockRejectedValue(Object.assign(new Error("unavailable"),{error_code:"slack_rate_limited",retryAfterSeconds:60}));
    await expect(sendCardReminder("reminder",2)).rejects.toMatchObject({error_code:"slack_rate_limited"});
    expect(mocks.rpc).toHaveBeenCalledWith("finish_card_reminder",expect.objectContaining({p_sent:false}));
  });
  it("다른 워커가 발송 중이면 전송을 중복하지 않는다",async()=>{
    mocks.rpc.mockResolvedValue({data:{busy:true},error:null});
    await expect(sendCardReminder("reminder",2)).rejects.toThrow(); expect(mocks.open).not.toHaveBeenCalled();
  });
});
