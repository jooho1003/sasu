import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@/lib/retro/bundle";
const mocks = vi.hoisted(() => ({ member: vi.fn(), rpc: vi.fn(), kick: vi.fn() }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.member }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/jobs", () => ({ kickWorker: mocks.kick }));
import { GET, POST } from "@/app/api/d/[dept]/retros/route";
const dept="11111111-1111-4111-8111-111111111111", user="22222222-2222-4222-8222-222222222222", id="33333333-3333-4333-8333-333333333333";
const context={params:Promise.resolve({dept})};
const payload=()=>({id,date:localDate(new Date(),"Asia/Seoul"),tz:"Asia/Seoul",bundle:null});
const request=(body:unknown)=>new Request(`http://localhost/api/d/${dept}/retros`,{method:"POST",body:JSON.stringify(body)});
describe("회고 요청 경계",()=>{
  beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("SASU_RETRO_ENABLED","true");mocks.member.mockResolvedValue({deptId:dept,userId:user,consentedAt:"2026-09-19"});mocks.rpc.mockResolvedValue({data:{id},error:null});});
  afterEach(()=>vi.unstubAllEnvs());
  it("기능 off·미동의는 쓰기 전에 종료한다",async()=>{
    vi.stubEnv("SASU_RETRO_ENABLED","false");expect((await POST(request(payload()),context)).status).toBe(404);expect(mocks.member).not.toHaveBeenCalled();
    vi.stubEnv("SASU_RETRO_ENABLED","true");mocks.member.mockResolvedValue({deptId:dept,userId:user,consentedAt:null});expect((await POST(request(payload()),context)).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("신원 주입과 길이 헤더 없는 큰 요청을 거부한다",async()=>{
    expect((await POST(request({...payload(),user_id:user,dept_id:dept}),context)).status).toBe(400);
    expect((await POST(request({...payload(),padding:"한".repeat(350000)}),context)).status).toBe(413);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("세션 부서만 RPC에 넘기고 저장 이후 워커를 시작한다",async()=>{
    const response=await POST(request(payload()),context);expect(response.status).toBe(202);expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc.mock.calls[0]).toEqual(["create_retro_day",expect.objectContaining({p_dept:dept,p_day:id})]);expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("p_user");expect(mocks.kick).toHaveBeenCalledOnce();
  });
  it("DB 오류 원문을 숨기고 실패한 저장에는 워커를 시작하지 않는다",async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{message:"합성 비공개 원문"}});const response=await POST(request(payload()),context);expect(response.status).toBe(500);expect(await response.text()).not.toContain("합성 비공개 원문");expect(mocks.kick).not.toHaveBeenCalled();
  });
  it("내 회고 필터는 세션 사용자를 적용한다",async()=>{
    await GET(new Request(`http://localhost/api/d/${dept}/retros?mine=1&user=${id}`),context);expect(mocks.rpc).toHaveBeenCalledWith("retro_timeline",expect.objectContaining({p_dept:dept,p_user:user}));
  });
});
