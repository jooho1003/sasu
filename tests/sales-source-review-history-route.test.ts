import {beforeEach,describe,expect,it,vi} from "vitest";

const m=vi.hoisted(()=>({member:vi.fn(),rpc:vi.fn(),from:vi.fn(),select:vi.fn(),eq:vi.fn(),order:vi.fn(),or:vi.fn(),limit:vi.fn()}));
vi.mock("@/lib/supabase/membership",()=>({requireMembership:m.member}));
vi.mock("@/lib/supabase/server",()=>({createServerSupabaseClient:async()=>({rpc:m.rpc,from:m.from})}));
import {GET} from "@/app/api/d/[dept]/sales-review/history/route";

const dept="22222222-2222-4222-8222-222222222222",user="11111111-1111-4111-8111-111111111111";
const timestamp="2026-10-01T12:00:00.123456+00:00";
const rows=Array.from({length:21},(_,i)=>({id:`00000000-0000-4000-8000-${String(30-i).padStart(12,"0")}`,created_at:timestamp,status:"ready",result:"not returned",versions:["private"]}));
const ctx={params:Promise.resolve({dept})};
const get=(query="")=>GET(new Request("http://localhost/history"+query),ctx);

describe("source review history session API",()=>{
  beforeEach(()=>{
    vi.resetAllMocks();
    m.member.mockResolvedValue({deptId:dept,userId:user,role:"lead",consentedAt:"yes"});
    m.rpc.mockResolvedValue({data:false,error:null});
    const q={select:m.select,eq:m.eq,order:m.order,or:m.or,limit:m.limit};
    for(const fn of [m.from,m.select,m.eq,m.order,m.or]) fn.mockReturnValue(q);
    m.limit.mockResolvedValue({data:rows,error:null});
  });
  it("returns only twenty metadata rows and a stable next cursor with no count",async()=>{
    const res=await get();expect(res.status).toBe(200);expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body=await res.json();expect(body.tasks).toHaveLength(20);
    expect(body.tasks[0]).toEqual({id:rows[0].id,created_at:timestamp,status:"ready"});
    expect(body.next_cursor).toEqual({created_at:timestamp,id:rows[19].id});
    expect(Object.keys(body).sort()).toEqual(["next_cursor","tasks"]);
    expect(m.select).toHaveBeenCalledWith("id,created_at,status");
    expect(m.eq.mock.calls).toEqual([["dept_id",dept],["requested_by",user]]);
    expect(m.order.mock.calls).toEqual([["created_at",{ascending:false}],["id",{ascending:false}]]);
    expect(m.limit).toHaveBeenCalledWith(21);
  });
  it("uses exact fractional timestamp and ID for same-time keyset pagination",async()=>{
    const query=new URLSearchParams({before_created_at:timestamp,before_id:user});
    expect((await get("?"+query)).status).toBe(200);
    expect(m.or).toHaveBeenCalledWith(`created_at.lt.${timestamp},and(created_at.eq.${timestamp},id.lt.${user})`);
  });
  it.each(["?before_id="+user,"?before_created_at="+timestamp,"?before_id=bad&before_created_at=2026-10-01T00:00:00Z","?page=2","?before_id="+user+"&before_id="+user,"?before_created_at=2026-10-01T00:00:00Z%2Cor(id.gt.x)&before_id="+user])("rejects malformed/unknown/duplicate cursor %s",async query=>{
    expect((await get(query)).status).toBe(400);expect(m.from).not.toHaveBeenCalled();
  });
  it.each([{role:"member",consentedAt:"yes"},{role:"lead",consentedAt:null}])("rejects membership %j",async member=>{
    m.member.mockResolvedValue({deptId:dept,userId:user,...member});expect((await get()).status).toBe(403);expect(m.from).not.toHaveBeenCalled();
  });
  it("fails closed for demo or failed demo query",async()=>{
    m.rpc.mockResolvedValueOnce({data:true,error:null});expect((await get()).status).toBe(403);
    m.rpc.mockResolvedValueOnce({data:null,error:{message:"failure"}});expect((await get()).status).toBe(403);
    expect(m.from).not.toHaveBeenCalled();
  });
  it("returns empty/final page without cursor and safely maps database errors",async()=>{
    m.limit.mockResolvedValueOnce({data:[],error:null});expect(await (await get()).json()).toEqual({tasks:[],next_cursor:null});
    m.limit.mockResolvedValueOnce({data:rows.slice(0,20),error:null});expect((await (await get()).json()).next_cursor).toBeNull();
    m.limit.mockResolvedValueOnce({data:null,error:{message:"secret_database_error"}});const res=await get();expect(res.status).toBe(500);expect(await res.text()).not.toContain("secret_database_error");
  });
  it("preserves existing unauthenticated membership redirect",async()=>{
    m.member.mockRejectedValueOnce(Error("NEXT_REDIRECT"));await expect(get()).rejects.toThrow("NEXT_REDIRECT");expect(m.from).not.toHaveBeenCalled();
  });
});
