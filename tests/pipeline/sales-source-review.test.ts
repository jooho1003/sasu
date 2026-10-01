import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),structured:vi.fn(),register:vi.fn()}));
vi.mock("@/lib/supabase/service",()=>({createServiceSupabaseClient:()=>({rpc:mocks.rpc})}));
vi.mock("@/lib/llm",()=>({llm:{structured:mocks.structured}}));
vi.mock("@/lib/jobs",()=>({registerHandler:mocks.register}));
import {runSalesSourceReview,registerSalesSourceReviewHandler} from "@/lib/pipeline/sales-source-review";
const id="11111111-1111-4111-8111-111111111111",dept="22222222-2222-4222-8222-222222222222";
const task={id,dept_id:dept,requested_by:id,item_ids:[id,id,id,id],versions:["v","v","v","v"]};
const rows=[1,2,3,4].map(n=>({position:n,item_id:String(n),title:"자료",kind:"document",content:"가격 조건은 승인 전 확정하지 않습니다.",version:"v"}));
const choice={topics:[{topic:"price",selections:[{evidence:1,first_paragraph:1,last_paragraph:1}]}]};
describe("real source worker",()=>{
  beforeEach(()=>{vi.resetAllMocks();mocks.rpc.mockImplementation(async(name:string)=>({data:name==="claim_sales_source_review"?[task]:name==="sales_source_review_inputs"?rows:true,error:null}));mocks.structured.mockResolvedValue({data:choice});});
  it("claims and rechecks SQL inputs then saves only validated indices",async()=>{
    await runSalesSourceReview(id);
    expect(mocks.structured).toHaveBeenCalledWith("sales_source_review",expect.anything(),expect.objectContaining({system:expect.stringContaining("명령")}),{deptId:dept});
  });
  it("persists the model indices instead of source text or a generated question",async()=>{
    await runSalesSourceReview(id);
    expect(mocks.rpc).toHaveBeenCalledWith("finish_sales_source_review",{p_task:id,p_status:"ready",p_result:choice});
    expect(JSON.stringify(mocks.rpc.mock.calls.filter(c=>c[0]==="finish_sales_source_review"))).not.toContain("확정하지");
  });
  it("does not invoke LLM after an empty claim or revoked input",async()=>{
    mocks.rpc.mockResolvedValueOnce({data:[],error:null});await runSalesSourceReview(id);expect(mocks.structured).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({data:[task],error:null}).mockResolvedValueOnce({data:[],error:null});
    await expect(runSalesSourceReview(id)).rejects.toThrow();expect(mocks.structured).not.toHaveBeenCalled();
  });
  it("refuses empty selections without storing a result",async()=>{
    mocks.structured.mockResolvedValueOnce({data:{topics:[]}});await runSalesSourceReview(id);
    expect(mocks.rpc).toHaveBeenCalledWith("finish_sales_source_review",{p_task:id,p_status:"refused",p_result:null});
  });
  it("does not finish invalid selections or model failure",async()=>{
    mocks.structured.mockResolvedValueOnce({data:{topics:[{topic:"price",selections:[{evidence:1,first_paragraph:2,last_paragraph:2}]}]}});
    await expect(runSalesSourceReview(id)).rejects.toThrow();
    expect(mocks.rpc.mock.calls.some(c=>c[0]==="finish_sales_source_review")).toBe(false);
  });
  it("registers and validates UUID job payload",async()=>{
    registerSalesSourceReviewHandler();expect(mocks.register).toHaveBeenCalledWith("run_sales_source_review",expect.any(Function));
    await expect(mocks.register.mock.calls[0][1]({taskId:"bad"})).rejects.toThrow();
  });
});
