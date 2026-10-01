import {z} from "zod";
import {SalesSourceReviewChoice} from "@/lib/contracts";
import {registerHandler} from "@/lib/jobs";
import {llm} from "@/lib/llm";
import {buildSalesSourceReview,prepareSalesSourceInputs,SALES_SOURCE_REVIEW_SYSTEM,type SalesSourceInputRow} from "@/lib/sales-source-review";
import {createServiceSupabaseClient} from "@/lib/supabase/service";

type Task={id:string;dept_id:string;requested_by:string;item_ids:string[];versions:string[]};

// Design Ref: §3 — SQL revalidates current authority and enforces terminal-state fencing.
export async function runSalesSourceReview(taskId:string):Promise<void> {
  const client=createServiceSupabaseClient();
  const claimed=await client.rpc("claim_sales_source_review",{p_task:taskId});
  if(claimed.error) throw Error("sales_source_database_failed");
  const task=(claimed.data as Task[] | null)?.[0];
  if(!task) return;
  const read=await client.rpc("sales_source_review_inputs",{
    p_user:task.requested_by,p_dept:task.dept_id,p_ids:task.item_ids,p_versions:task.versions,
  });
  if(read.error) throw Error("sales_source_database_failed");
  const inputs=prepareSalesSourceInputs((read.data??[]) as SalesSourceInputRow[]);
  const model=await llm.structured("sales_source_review",SalesSourceReviewChoice,{
    system:SALES_SOURCE_REVIEW_SYSTEM,
    user:JSON.stringify({sources:inputs.map((row,index)=>({
      evidence:index+1,role:row.role,paragraphs:row.paragraphs.map((text,i)=>({number:i+1,text})),
    }))}),
  },{deptId:task.dept_id});
  const choice=SalesSourceReviewChoice.parse(model.data);
  const result=buildSalesSourceReview(choice,inputs,task.dept_id);
  const finished=await client.rpc("finish_sales_source_review",{
    p_task:task.id,p_status:result.status,p_result:result.status==="ready"?choice:null,
  });
  if(finished.error) throw Error("sales_source_database_failed");
}

export function registerSalesSourceReviewHandler():void {
  registerHandler("run_sales_source_review",async(payload:unknown)=>{
    const parsed=z.object({taskId:z.uuid()}).safeParse(payload);
    if(!parsed.success) throw Error("sales_source_payload_invalid");
    await runSalesSourceReview(parsed.data.taskId);
  });
}
