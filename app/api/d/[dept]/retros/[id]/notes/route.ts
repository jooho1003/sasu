import { z } from "zod";
import { llm } from "@/lib/llm";
import { mask } from "@/lib/mask";
import { validateVoiceUpload, MAX_VOICE_UPLOAD_BYTES } from "@/lib/adapters/voice";
import { accessible, fail, noStore, readBody, type Context } from "../../_shared";

const Note=z.strictObject({text:z.string().trim().min(1).max(500)});
export async function POST(request:Request,context:Context) {
  const access=await accessible(context);if(access instanceof Response)return access;
  if(!access.owner)return fail("retro_not_found");
  if(!access.member.consentedAt)return fail("consent_required");
  let kind="manual_note",text="";
  const contentType=request.headers.get("content-type")??"";
  if(contentType.includes("multipart/form-data")) {
    const max=MAX_VOICE_UPLOAD_BYTES+65536;
    if(Number(request.headers.get("content-length"))>max)return fail("invalid_note");
    const reader=request.body?.getReader();if(!reader)return fail("invalid_note");
    let count=0;const chunks:Uint8Array[]=[];
    try {
      while(true){const part=await reader.read();if(part.done)break;count+=part.value.length;if(count>max){await reader.cancel();return fail("invalid_note");}chunks.push(part.value);}
    } catch {return fail("invalid_note");} finally {reader.releaseLock();}
    const form=await new Response(Buffer.concat(chunks),{headers:{"content-type":contentType}}).formData().catch(()=>null);
    const file=form?.get("audio");
    if(!(file instanceof File)||!validateVoiceUpload({filename:file.name,mimeType:file.type,size:file.size}).ok)return fail("invalid_note");
    try {text=(await llm.transcribeAudio({bytes:new Uint8Array(await file.arrayBuffer()),filename:file.name.slice(0,100),mimeType:file.type})).data.text;kind="voice_note";}
    catch{return fail("invalid_note");}
  } else {
    const body=await readBody(request);if(body instanceof Response)return body;
    const parsed=Note.safeParse(body);if(!parsed.success)return fail("invalid_note");text=parsed.data.text;
  }
  const cleaned=mask(text).trim();if(!cleaned||cleaned.length>500)return fail("invalid_note");
  const result=await access.client.rpc("add_retro_note",{p_day:access.day.id,p_kind:kind,p_text:cleaned});
  return result.error?fail(result.error):Response.json({id:result.data,kind},{headers:noStore,status:201});
}
