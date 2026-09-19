import { z } from "zod";
import { llm } from "@/lib/llm";
import { mask } from "@/lib/mask";
import { accessible, fail, noStore, type Context } from "../../_shared";

const Note = z.strictObject({ text: z.string().trim().min(1).max(500) });
export async function POST(request: Request, context: Context) {
  const access = await accessible(context);
  if (access instanceof Response) return access;
  if (!access.owner) return fail("retro_not_found");
  let kind = "manual_note", text = "";
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const file = form?.get("audio");
    if (!(file instanceof File) || file.size > 10 * 1024 * 1024) return fail("invalid_note");
    try {
      const result = await llm.transcribeAudio({ bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name.slice(0, 100), mimeType: file.type });
      text = result.data.text;
      kind = "voice_note";
    } catch (error) { return fail(error); }
  } else {
    const parsed = Note.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("invalid_note");
    text = parsed.data.text;
  }
  const result = await access.client.rpc("add_retro_note", { p_day: access.day.id, p_kind: kind, p_text: mask(text).slice(0, 500) });
  return result.error ? fail(result.error) : Response.json({ id: result.data, kind }, { headers: noStore, status: 201 });
}
