import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { metadataBase } from "@/lib/site";
import { enabled, fail, noStore, readBody } from "../_shared";
type Context={params:Promise<{dept:string}>};
async function change(request:Request,{params}:Context,withdraw:boolean) {
  if(!enabled())return fail("retro_not_found");
  if(request.headers.get("origin")!==metadataBase().origin)return Response.json({error:"허용되지 않은 요청입니다."},{status:403,headers:noStore});
  const {dept}=await params,member=await requireMembership(dept);
  if(!withdraw){const body=await readBody(request);if(body instanceof Response)return body;if(!body||typeof body!=="object"||Reflect.get(body,"version")!=="1"||Reflect.get(body,"consent")!==true)return fail("invalid_retro");}
  const result=await (await createServerSupabaseClient()).rpc(withdraw?"withdraw_retro_share":"consent_retro_share",{p_dept:member.deptId,...(withdraw?{}:{p_version:"1"})});
  return result.error?fail(result.error):new Response(null,{status:204,headers:noStore});
}
export const POST=(request:Request,context:Context)=>change(request,context,false);
export const DELETE=(request:Request,context:Context)=>change(request,context,true);
