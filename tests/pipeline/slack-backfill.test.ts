import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),history:vi.fn(),from:vi.fn()}));
vi.mock("@/lib/supabase/service",()=>({createServiceSupabaseClient:()=>mocks}));
vi.mock("@/lib/slack/post",()=>({historyPage:mocks.history}));
vi.mock("@/lib/jobs",()=>({registerHandler:vi.fn()}));
import { backfillSlackChannel, sevenDaysAgoUnixSeconds } from "@/lib/pipeline/slack-backfill";
describe("Slack 백필 범위",()=>{
  beforeEach(()=>{
    vi.resetAllMocks();
    mocks.rpc.mockResolvedValue({data:true,error:null});
    mocks.history.mockResolvedValue({messages:[{type:"message",ts:"1725000000.000100",user:"UQA",text:"새 원문"}],nextCursor:null});
    mocks.from.mockImplementation((table:string)=>{
      const q={eq:()=>q,maybeSingle:async()=>({data:{id:"source-1",dept_id:"dept-1",external_id:"CQA",kind:"slack_channel",active:true,sync_cursor:null},error:null}),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:table==="members"?[{slack_user_id:"UQA",display_name:"QA",consented_at:"2026-09-16"}]:null,error:null}).then(resolve)};
      if(table==="items") throw new Error("Backfill cannot overwrite existing originals");
      return {select:()=>q,update:()=>q};
    });
  });
  it("기준 시각에서 정확히 7일 전의 Unix timestamp를 만든다",()=>expect(sevenDaysAgoUnixSeconds(new Date("2026-09-10T12:00:00.000Z"))).toBe("1788436800"));
  it("기존 원문/삭제 상태를 덮어쓰지 않는 원자 수집 RPC를 사용한다",async()=>{
    expect(await backfillSlackChannel("source-1")).toBe(1);
    expect(mocks.rpc).toHaveBeenCalledWith("ingest_slack_atomic",expect.objectContaining({p_event_id:"backfill:source-1:1725000000.000100",p_kind:"item",p_content:"새 원문"}));
    expect(mocks.from).not.toHaveBeenCalledWith("items");
  });
  it("백필에 이미 수정된 원문이 있으면 수정 시각까지 기록해 늦은 이벤트의 덮어쓰기를 막는다",async()=>{
    mocks.history.mockResolvedValue({messages:[{type:"message",ts:"1725000000.000100",user:"UQA",text:"수정된 원문",edited:{ts:"1725000009.000100"}}],nextCursor:null});
    await backfillSlackChannel("source-1");
    expect(mocks.rpc).toHaveBeenCalledWith("apply_slack_change",expect.objectContaining({p_changed_at:"1725000009.000100",p_ref:"1725000000.000100",p_content:"수정된 원문"}));
    expect(mocks.rpc).not.toHaveBeenCalledWith("ingest_slack_atomic",expect.anything());
  });
});
