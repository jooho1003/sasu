import { connectionEncryptionConfigured } from "@/lib/retro/connection-crypto";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { RetroConnectionProvider } from "@/lib/contracts";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { saveRetroConnection } from "@/lib/adapters/retro-connection";
import { metadataBase } from "@/lib/site";
import { exchangeCredential, stateHash } from "@/lib/retro/connectors/auth";
import { parseConnectorConfig } from "@/lib/retro/connectors/registry";
import { enabled, fail, noStore } from "@/app/api/d/[dept]/retros/_shared";

export async function GET(request:Request,{params}:{params:Promise<{provider:string}>}) {
  if(!enabled())return fail("retro_not_found");
  if(!connectionEncryptionConfigured())return fail("connector_not_configured");
  const parsed=RetroConnectionProvider.safeParse((await params).provider);if(!parsed.success)return fail("connection_not_found");
  const provider=parsed.data,base=metadataBase(),url=new URL(request.url),jar=await cookies(),path="/api/retro/connect/"+provider;
  const [expected,verifier,...extra]=(jar.get("sasu-retro-"+provider)?.value??"").split(".");
  const state=url.searchParams.get("state")??"";
  const invalid=()=>Response.json({error:"연결 확인이 만료됐습니다. 설정에서 다시 연결해 주세요."},{status:400,headers:noStore});
  if(!/^[A-Za-z0-9_-]{43}$/.test(state)||!/^[A-Za-z0-9_-]{43}$/.test(expected??"")||!/^[A-Za-z0-9_-]{43}$/.test(verifier??"")||extra.length||!timingSafeEqual(Buffer.from(state),Buffer.from(expected)))return invalid();
  jar.set("sasu-retro-"+provider,"",{httpOnly:true,secure:true,sameSite:"lax",maxAge:0,path});
  const client=await createServerSupabaseClient(),auth=await client.auth.getUser();
  if(auth.error||!auth.data.user)return invalid();
  const hash=stateHash(state),consumed=await client.rpc("consume_retro_connection_state",{p_hash:hash,p_provider:provider});
  if(consumed.error||!consumed.data||consumed.data.auth_kind!=="oauth")return invalid();
  const dept=consumed.data.dept_id;
  const done=(status:string)=>new Response(null,{status:303,headers:{...noStore,Location:new URL("/d/"+dept+"/settings?retro="+status,base).href}});
  if(url.searchParams.has("error"))return done("cancelled");
  const code=url.searchParams.get("code");if(!code||code.length>2048)return done("failed");
  try {
    parseConnectorConfig(provider,consumed.data.config);
    const credential=await exchangeCredential(provider,code,new URL(path+"/callback",base).href,verifier,fetch,consumed.data.config);
    await saveRetroConnection({hash,actor:auth.data.user.id,dept,provider,credential});
    return done("connected");
  } catch {return done("failed");}
}
