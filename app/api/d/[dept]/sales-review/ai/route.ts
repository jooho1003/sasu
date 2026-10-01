import {z} from "zod";
import {SalesSourceReviewRequest} from "@/lib/contracts";
import {kickWorker} from "@/lib/jobs";
import {buildSalesSourceReview,prepareSalesSourceInputs,salesSourceVersions,type SalesSourceInputRow} from "@/lib/sales-source-review";
import {requireMembership} from "@/lib/supabase/membership";
import {createServerSupabaseClient} from "@/lib/supabase/server";

const headers={"Cache-Control":"private, no-store"};
const respond=(error:string,status:number)=>Response.json({error},{status,headers});
type Context={params:Promise<{dept:string}>};

async function context(params:Context["params"]) {
  const {dept}=await params;
  const member=await requireMembership(dept);
  if(member.role!=="lead" || !member.consentedAt) return {error:respond("동의한 팀장만 사수 검토를 이용할 수 있습니다.",403)} as const;
  const client=await createServerSupabaseClient();
  const demo=await client.rpc("is_demo_department",{p_dept:member.deptId});
  if(demo.error || demo.data!==false) return {error:respond("이 부서에서는 사수 검토를 이용할 수 없습니다.",403)} as const;
  return {client,member} as const;
}

export async function POST(request:Request,{params}:Context) {
  const ctx=await context(params);
  if(ctx.error) return ctx.error;
  const parsed=SalesSourceReviewRequest.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return respond("서로 다른 원문 4건과 요청 번호를 확인해 주세요.",400);
  const {request_id,...selection}=parsed.data;
  const ids=Object.values(selection);
  if(new Set(ids).size!==4) return respond("서로 다른 원문 4건을 선택해 주세요.",400);
  const read=await ctx.client.rpc("sales_source_review_inputs",{
    p_user:ctx.member.userId,p_dept:ctx.member.deptId,p_ids:ids,p_versions:null,
  });
  if(read.error) return respond("원문을 확인하지 못했습니다. 다시 시도해 주세요.",500);
  let versions:string[];
  try {
    const inputs=prepareSalesSourceInputs((read.data??[]) as SalesSourceInputRow[]);
    versions=salesSourceVersions(inputs);
  } catch(cause) {
    return cause instanceof Error && cause.message==="sales_source_too_large"
      ?respond("원문 길이나 문단 수가 사수 검토 한도를 넘었습니다. 원문에서 직접 확인해 주세요.",422)
      :respond("현재 확인할 수 없는 원문이 있습니다. 다시 선택해 주세요.",404);
  }
  const created=await ctx.client.rpc("request_sales_source_review",{
    p_dept:ctx.member.deptId,p_ids:ids,p_request_id:request_id,p_versions:versions,
  });
  if(created.error) {
    const code=created.error.message;
    if(code.includes("sales_source_forbidden")) return respond("현재 사수 검토를 요청할 수 없습니다.",403);
    if(code.includes("sales_source_unavailable")) return respond("원문이 바뀌었거나 확인할 수 없습니다. 다시 선택해 주세요.",404);
    if(code.includes("sales_source_daily_limit")) return respond("오늘 사수 검토 한도 10건에 도달했습니다. 내일 다시 시도해 주세요.",429);
    if(code.includes("sales_source_too_large")) return respond("원문이 사수 검토 한도를 넘었습니다. 원문에서 직접 확인해 주세요.",422);
    if(code.includes("sales_source_invalid")) return respond("요청 번호나 원문 선택을 확인해 주세요.",400);
    return respond("사수 검토를 시작하지 못했습니다. 다시 시도해 주세요.",500);
  }
  kickWorker();
  return Response.json({task_id:created.data},{status:202,headers});
}

export async function GET(request:Request,{params}:Context) {
  const ctx=await context(params);
  if(ctx.error) return ctx.error;
  const parsed=z.uuid().safeParse(new URL(request.url).searchParams.get("task_id"));
  if(!parsed.success) return respond("검토 번호를 확인해 주세요.",400);
  // Design Ref: §3 — session RLS hides tasks unless all current inputs are still valid.
  const read=await ctx.client.from("sales_source_reviews")
    .select("id,dept_id,requested_by,item_ids,versions,status,status_reason,result")
    .eq("id",parsed.data).eq("dept_id",ctx.member.deptId).maybeSingle();
  if(read.error) return respond("검토를 불러오지 못했습니다. 다시 시도해 주세요.",500);
  const task=read.data;
  if(!task) return respond("현재 확인할 수 없는 검토입니다. 원문을 다시 선택해 주세요.",404);
  let result=null;
  if(task.status==="ready") {
    const sources=await ctx.client.rpc("sales_source_review_inputs",{
      p_user:ctx.member.userId,p_dept:ctx.member.deptId,p_ids:task.item_ids,p_versions:task.versions,
    });
    if(sources.error) return respond("현재 원문을 확인하지 못했습니다. 다시 시도해 주세요.",500);
    try {
      result=buildSalesSourceReview(task.result,prepareSalesSourceInputs((sources.data??[]) as SalesSourceInputRow[]),ctx.member.deptId);
      if(result.status!=="ready") throw Error("citation_invalid");
    } catch {
      return respond("검토 근거를 확인할 수 없습니다. 원문을 다시 선택해 주세요.",404);
    }
  }
  return Response.json({task:{id:task.id,status:task.status,result}},{headers});
}
