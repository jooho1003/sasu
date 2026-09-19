import { connectionEncryptionConfigured } from "@/lib/retro/connection-crypto";
import { randomBytes } from "node:crypto";
import { RetroConnectionInput } from "@/lib/contracts";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { saveRetroConnection } from "@/lib/adapters/retro-connection";
import { stateHash, validatePersonalToken, oauthConfigured } from "@/lib/retro/connectors/auth";
import { isDepartmentConnector } from "@/lib/retro/connectors/department";
import { AVAILABLE_CONNECTORS, CONNECTOR_LABELS, parseConnectorConfig } from "@/lib/retro/connectors/registry";
import { metadataBase } from "@/lib/site";
import { enabled, fail, noStore, readBody } from "../_shared";

type Context={params:Promise<{dept:string}>};
export async function GET(_request:Request,{params}:Context) {
  if(!enabled())return fail("retro_not_found");
  const {dept}=await params, member=await requireMembership(dept), client=await createServerSupabaseClient();
  const [result,department,settings]=await Promise.all([
    client.from("retro_connections").select("id,provider,status,account_label,config,last_pulled_at,last_error,failure_count,created_at,updated_at,revoked_at").eq("dept_id",member.deptId).eq("user_id",member.userId).order("created_at"),
    client.from("departments").select("retro_preset").eq("id",member.deptId).single(),
    client.from("retro_user_settings").select("share_consented_at").eq("dept_id",member.deptId).eq("user_id",member.userId).maybeSingle(),
  ]);
  if(result.error||department.error||settings.error)return fail("unknown");
  return Response.json({connections:result.data??[],preset:department.data.retro_preset,shareConsented:!!settings.data?.share_consented_at,
    providers:AVAILABLE_CONNECTORS.filter(id=>!isDepartmentConnector(id)||member.role==="lead").map(id=>({id,label:CONNECTOR_LABELS[id],token:connectionEncryptionConfigured()&&(["github","figma","salesmap","wanted","stibee"].includes(id)),oauth:connectionEncryptionConfigured()&&oauthConfigured(id)}))},{headers:noStore});
}
export async function POST(request:Request,{params}:Context) {
  if(!enabled())return fail("retro_not_found");
  if(request.headers.get("origin")!==metadataBase().origin)return Response.json({error:"허용되지 않은 요청입니다."},{status:403,headers:noStore});
  const {dept}=await params,member=await requireMembership(dept);
  if(!member.consentedAt)return fail("consent_required");
  if(!connectionEncryptionConfigured())return fail("connector_not_configured");
  const body=await readBody(request);if(body instanceof Response)return body;
  const input=RetroConnectionInput.safeParse(body);if(!input.success)return fail("invalid_connection");
  const client=await createServerSupabaseClient(), hash=stateHash(randomBytes(32).toString("base64url"));
  try {
    const config=parseConnectorConfig(input.data.provider,input.data.config);
    const started=await client.rpc("begin_retro_connection",{p_dept:member.deptId,p_provider:input.data.provider,p_hash:hash,p_config:config,p_auth_kind:"token"});
    if(started.error)return fail(started.error);
    const consumed=await client.rpc("consume_retro_connection_state",{p_hash:hash,p_provider:input.data.provider});
    if(consumed.error||!consumed.data)return fail("connector_failed");
    const credential=await validatePersonalToken(input.data.provider,input.data.secret);
    const id=await saveRetroConnection({hash,actor:member.userId,dept:member.deptId,provider:input.data.provider,credential});
    return Response.json({id},{status:201,headers:noStore});
  } catch(error){return fail(error);}
}
