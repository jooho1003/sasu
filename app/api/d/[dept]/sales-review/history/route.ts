import {z} from "zod";
import {requireMembership} from "@/lib/supabase/membership";
import {createServerSupabaseClient} from "@/lib/supabase/server";

const headers={"Cache-Control":"private, no-store"};
const respond=(error:string,status:number)=>Response.json({error},{status,headers});
const cursorSchema=z.strictObject({before_created_at:z.iso.datetime({offset:true}).optional(),before_id:z.uuid().optional()})
  .refine(cursor=>Boolean(cursor.before_created_at)===Boolean(cursor.before_id));

export async function GET(request:Request,{params}:{params:Promise<{dept:string}>}) {
  const {dept}=await params;
  const member=await requireMembership(dept);
  if(member.role!=="lead" || !member.consentedAt) return respond("동의한 팀장만 본인 검토 이력을 볼 수 있습니다.",403);
  const client=await createServerSupabaseClient();
  const demo=await client.rpc("is_demo_department",{p_dept:member.deptId});
  if(demo.error || demo.data!==false) return respond("이 부서에서는 검토 이력을 볼 수 없습니다.",403);
  const query=new URL(request.url).searchParams;
  const parsed=cursorSchema.safeParse(Object.fromEntries(query));
  if(!parsed.success || new Set(query.keys()).size!==Array.from(query.keys()).length) return respond("이력을 볼 위치를 확인해 주세요.",400);
  // Design Ref: §4 — existing current-input RLS remains the sole visibility check.
  let read=client.from("sales_source_reviews").select("id,created_at,status")
    .eq("dept_id",member.deptId).eq("requested_by",member.userId)
    .order("created_at",{ascending:false}).order("id",{ascending:false});
  const {before_created_at:time,before_id:id}=parsed.data;
  if(time && id) read=read.or(`created_at.lt.${time},and(created_at.eq.${time},id.lt.${id})`);
  const result=await read.limit(21);
  if(result.error) return respond("검토 이력을 불러오지 못했습니다. 다시 시도해 주세요.",500);
  const rows=result.data??[];
  const tasks=rows.slice(0,20).map(row=>({id:row.id,created_at:row.created_at,status:row.status}));
  const last=tasks.at(-1);
  const next_cursor=rows.length>20 && last?{created_at:last.created_at,id:last.id}:null;
  return Response.json({tasks,next_cursor},{headers});
}
