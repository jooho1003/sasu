import { connectionEncryptionConfigured } from "@/lib/retro/connection-crypto";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { RetroConnectionProvider, RetroOAuthStart } from "@/lib/contracts";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { metadataBase } from "@/lib/site";
import { authorizationUrl, oauthConfigured, stateHash } from "@/lib/retro/connectors/auth";
import { parseConnectorConfig } from "@/lib/retro/connectors/registry";
import { enabled, fail, noStore, readBody } from "@/app/api/d/[dept]/retros/_shared";

export async function POST(request:Request,{params}:{params:Promise<{provider:string}>}) {
  if(!enabled())return fail("retro_not_found");
  const base=metadataBase();
  if(request.headers.get("origin")!==base.origin)return Response.json({error:"허용되지 않은 요청입니다."},{status:403,headers:noStore});
  if(!connectionEncryptionConfigured())return fail("connector_not_configured");
  const parsed=RetroConnectionProvider.safeParse((await params).provider);if(!parsed.success)return fail("connection_not_found");
  const provider=parsed.data;
  if(base.protocol!=="https:"||!oauthConfigured(provider))return fail("connector_not_configured");
  const body=await readBody(request);if(body instanceof Response)return body;
  const input=RetroOAuthStart.safeParse(body);if(!input.success)return fail("invalid_connection");
  const member=await requireMembership(input.data.dept);
  if(!member.consentedAt)return fail("consent_required");
  if(!connectionEncryptionConfigured())return fail("connector_not_configured");
  try {
    const config=parseConnectorConfig(provider,input.data.config);
    const state=randomBytes(32).toString("base64url"), verifier=randomBytes(32).toString("base64url");
    const result=await (await createServerSupabaseClient()).rpc("begin_retro_connection",{p_dept:member.deptId,p_provider:provider,p_hash:stateHash(state),p_config:config,p_auth_kind:"oauth"});
    if(result.error)return fail(result.error);
    const path="/api/retro/connect/"+provider;
    (await cookies()).set("sasu-retro-"+provider,state+"."+verifier,{httpOnly:true,secure:true,sameSite:"lax",maxAge:600,path});
    return Response.json({url:authorizationUrl(provider,state,new URL(path+"/callback",base).href,verifier,config)},{headers:noStore});
  } catch(error){return fail(error);}
}
