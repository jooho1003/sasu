import { z } from "zod";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { enabled, fail } from "../_shared";

export async function connectionAccess(params:Promise<{dept:string;id:string}>) {
  if(!enabled())return fail("retro_not_found");
  const {dept,id}=await params;
  if(!z.uuid().safeParse(id).success)return fail("connection_not_found");
  const member=await requireMembership(dept),client=await createServerSupabaseClient();
  const result=await client.from("retro_connections").select("id,status").eq("id",id).eq("dept_id",member.deptId).eq("user_id",member.userId).maybeSingle();
  if(result.error||!result.data)return fail("connection_not_found");
  return {client,member,connection:result.data};
}
