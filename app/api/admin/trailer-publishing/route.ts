import { z } from "zod";
import { orgAdminWritesEnabled, trailerPublishEnabled } from "@/lib/features";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { jsonBody, trailerError, trailerNotFound } from "@/app/api/d/[dept]/trailers/_shared";
export async function POST(request: Request) {
  if (!orgAdminWritesEnabled() || !trailerPublishEnabled()) return trailerNotFound();
  const parsed = z.boolean().safeParse((await jsonBody(request)).enabled);
  if (!parsed.success) return Response.json({ error: "invalid_flag", message: "공개 허용 값을 확인해 주세요." }, { status: 400 });
  const result = await (await createServerSupabaseClient()).rpc("admin_set_trailer_publishing", { p_enabled: parsed.data });
  return result.error ? trailerError(result.error) : Response.json({ ok: true });
}
