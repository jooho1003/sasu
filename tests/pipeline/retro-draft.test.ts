import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), structured: vi.fn(), register: vi.fn(), member: vi.fn(), post: vi.fn(), dm: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => ({ rpc: mocks.rpc, from: () => ({select: () => ({eq: () => ({eq: () => ({not: () => ({maybeSingle: mocks.member})})})})}) }) }));
vi.mock("@/lib/llm", () => ({ llm: { structured: mocks.structured }, PLAIN_LANGUAGE_INSTRUCTION: "쉬운 말로 쓴다." }));
vi.mock("@/lib/jobs", () => ({ registerHandler: mocks.register }));
vi.mock("@/lib/slack/workspace", () => ({ withSlackDepartment: async (_client: unknown, _dept: string, action: () => Promise<unknown>) => action() }));
vi.mock("@/lib/slack/post", () => ({ openDirectMessage: mocks.dm, postMessage: mocks.post }));
import { draftRetro } from "@/lib/pipeline/retro-draft";
const activity = { id: "a", kind: "git_commit", title: "검증 완료", text: "", excluded: false, at: "2026-09-19T01:00:00Z" };
const claim = { day: { id: "d", dept_id: "dept", user_id: "u", retro_date: "2026-09-19" }, lease: "lease", activities: [activity] };
const cite = { activity_id: "A-1", quote: "검증 완료" };
const draft = { citations: [cite], title: "검증 회고", highlight: null, topics: ["검증"], body: { did: [{ text: "검증했다.", citations: [cite] }], learned: [], decided: [], next: [] } };
describe("회고 생성 워커", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_retro_draft" ? claim : true, error: null })); mocks.structured.mockResolvedValue({ data: draft }); mocks.member.mockResolvedValue({data:{slack_user_id:"U1"},error:null}); mocks.dm.mockResolvedValue({id:"D1"}); });
  it("claim 누락은 LLM 없이 종료한다", async () => { mocks.rpc.mockResolvedValueOnce({ data: null, error: null }); await draftRetro({ dayId: "d", revision: 0, generation: 1 }); expect(mocks.structured).not.toHaveBeenCalled(); });
  it("별칭을 원본 id로 되돌리고 lease·generation으로 저장한다", async () => {
    await draftRetro({ dayId: "d", revision: 0, generation: 1 });
    const finish = mocks.rpc.mock.calls.find(([name]) => name === "finish_retro_draft")![1];
    expect(finish).toMatchObject({ p_lease: "lease", p_generation: 1, p_error: null });
    expect(finish.p_body.did[0].citations[0].activity_id).toBe("a");
  });
  it("인용 0개는 needs_review 코드로 남긴다", async () => {
    mocks.structured.mockResolvedValue({ data: { ...draft, body: { ...draft.body, did: [{ text: "지어낸 문장", citations: [{ ...cite, quote: "없는 근거" }] }] } } });
    await draftRetro({ dayId: "d", revision: 0, generation: 1 });
    expect(mocks.rpc.mock.calls.find(([n]) => n === "finish_retro_draft")![1].p_error).toBe("retro_no_citations");
  });
  it("완료 알림은 본문·인용 없이 날짜·활동 건수·링크만 보낸다", async () => {
    await draftRetro({dayId:"d",revision:0,generation:1});
    expect(mocks.post).toHaveBeenCalledOnce();
    const message=JSON.stringify(mocks.post.mock.calls);
    expect(message).toContain("활동 1건"); expect(message).not.toContain("검증 완료"); expect(message).not.toContain("검증했다");
  });
  it("늦은 완료와 LLM 실패에는 DM을 보내지 않고 DM 실패는 초안을 없애지 않는다", async () => {
    mocks.rpc.mockImplementation(async(name:string)=>({data:name==="claim_retro_draft"?claim:name==="finish_retro_draft"?false:true,error:null}));
    await draftRetro({dayId:"d",revision:0,generation:1}); expect(mocks.post).not.toHaveBeenCalled();
    mocks.rpc.mockImplementation(async(name:string)=>({data:name==="claim_retro_draft"?claim:true,error:null}));
    mocks.dm.mockRejectedValue(new Error("slack_dm_unavailable"));
    await expect(draftRetro({dayId:"d",revision:0,generation:1})).resolves.toBeUndefined();
  });
  it("LLM 실패는 안전한 코드만 저장한다", async () => {
    mocks.structured.mockRejectedValue({ error_code: "llm_timeout", message: "원문 비밀" });
    await draftRetro({ dayId: "d", revision: 0, generation: 1 });
    expect(mocks.rpc.mock.calls.find(([n]) => n === "finish_retro_draft")![1].p_error).toBe("llm_timeout");
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("원문 비밀");
  });
});
