import {beforeEach,describe,expect,it,vi} from "vitest";
import {createHash} from "node:crypto";
const m=vi.hoisted(()=>({member:vi.fn(),rpc:vi.fn(),from:vi.fn(),kick:vi.fn(),task:null as unknown}));
vi.mock("@/lib/supabase/membership",()=>({requireMembership:m.member}));
vi.mock("@/lib/supabase/server",()=>({createServerSupabaseClient:async()=>({rpc:m.rpc,from:m.from})}));
vi.mock("@/lib/jobs",()=>({kickWorker:m.kick}));
import {GET,POST} from "@/app/api/d/[dept]/sales-review/ai/route";
const dept="22222222-2222-4222-8222-222222222222",user="11111111-1111-4111-8111-111111111111";
const ids=[1,2,3,4].map(n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`);
const input={request_item_id:ids[0],old_quote_item_id:ids[1],new_quote_item_id:ids[2],policy_item_id:ids[3],request_id:user};
const rows=ids.map((id,index)=>({position:index+1,item_id:id,title:"조건",kind:"document",content:"가격은 승인 후에 확정합니다.",version:"v"}));
const params={params:Promise.resolve({dept})};
const req=(body:unknown)=>new Request("http://localhost/api",{method:"POST",body:JSON.stringify(body)});
const get=()=>GET(new Request(`http://localhost/api?task_id=${user}`),params);
describe("AI source review session API",()=>{
  beforeEach(()=>{
    vi.resetAllMocks();m.member.mockResolvedValue({userId:user,deptId:dept,role:"lead",consentedAt:"yes"});
    m.rpc.mockImplementation(async(name:string)=>({data:name==="is_demo_department"?false:name==="sales_source_review_inputs"?rows:user,error:null}));
    m.task={id:user,dept_id:dept,requested_by:user,item_ids:ids,versions:["v","v","v","v"],status:"queued",result:null};
    const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:m.task,error:null})};m.from.mockReturnValue(query);
  });
  it("creates an atomic task with current hashes and starts worker",async()=>{
    const res=await POST(req(input),params);expect(res.status).toBe(202);expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(m.rpc).toHaveBeenCalledWith("request_sales_source_review",{p_dept:dept,p_ids:ids,p_request_id:user,p_versions:rows.map(r=>createHash("sha256").update(r.content).digest("hex"))});
    expect(m.kick).toHaveBeenCalledOnce();
  });
  it.each([{role:"member",consentedAt:"yes"},{role:"lead",consentedAt:null}])("rejects current membership %j",async(member)=>{
    m.member.mockResolvedValue({userId:user,deptId:dept,...member});
    expect((await POST(req(input),params)).status).toBe(403);expect((await get()).status).toBe(403);expect(m.rpc).not.toHaveBeenCalled();
  });
  it("rejects demo/failing demo lookup and strict/duplicate inputs",async()=>{
    m.rpc.mockResolvedValueOnce({data:true,error:null});expect((await POST(req(input),params)).status).toBe(403);
    expect((await POST(req({...input,dept_id:dept}),params)).status).toBe(400);
    expect((await POST(req({...input,policy_item_id:ids[0]}),params)).status).toBe(400);
  });
  it("rejects missing input and over-limit paragraph without write",async()=>{
    m.rpc.mockImplementation(async(name:string)=>({data:name==="is_demo_department"?false:[],error:null}));
    expect((await POST(req(input),params)).status).toBe(404);expect(m.kick).not.toHaveBeenCalled();
    m.rpc.mockImplementation(async(name:string)=>({data:name==="is_demo_department"?false:[{...rows[0],content:"a".repeat(4001)},...rows.slice(1)],error:null}));
    expect((await POST(req(input),params)).status).toBe(422);
  });
  it.each([["sales_source_daily_limit",429],["sales_source_unavailable",404],["sales_source_invalid",400],["sales_source_forbidden",403],["database",500]])("maps SQL %s to %i",async(code,status)=>{
    m.rpc.mockImplementation(async(name:string)=>({data:name==="is_demo_department"?false:rows,error:name==="request_sales_source_review"?{message:code}:null}));
    expect((await POST(req(input),params)).status).toBe(status);expect(m.kick).not.toHaveBeenCalled();
  });
  it("reads progress and resolves only current complete paragraph citations",async()=>{
    expect((await (await get()).json()).task).toMatchObject({status:"queued",result:null});
    m.task={...(m.task as object),status:"ready",result:{topics:[{topic:"price",selections:[{evidence:2,first_paragraph:1,last_paragraph:1}]}]}};
    const res=await get();expect(res.status).toBe(200);expect((await res.json()).task.result.topics[0].evidence[0].quote).toBe(rows[1].content);
  });
  it("hides revoked task and invalid persisted model output",async()=>{
    m.task=null;expect((await get()).status).toBe(404);
    m.task={id:user,item_ids:ids,versions:[],status:"ready",result:{topics:[],summary:"고객 승인"}};
    expect((await get()).status).toBe(404);
    expect((await GET(new Request("http://localhost/api?task_id=bad"),params)).status).toBe(400);
  });
});
