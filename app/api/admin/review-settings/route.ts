import { ReviewOrgSettings } from "@/lib/contracts";
import { orgAdminWritesEnabled } from "@/lib/features";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { featureNotFound, requestBody, rpcErrorResponse } from "../_shared";

export async function GET() {
  const client = await createServerSupabaseClient();
  const result = await client.rpc("admin_review_recording_count");
  if (result.error) return rpcErrorResponse(result.error);
  return Response.json({ active_recordings: result.data }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!orgAdminWritesEnabled()) return featureNotFound();
  const body = ReviewOrgSettings.strict().safeParse(await requestBody(request));
  if (!body.success) return Response.json({ error: "설정 값을 확인해 주세요." }, { status: 400 });
  const client = await createServerSupabaseClient();
  const result = await client.rpc("admin_set_review_settings", { p_recording: body.data.browser_recording_enabled, p_download: body.data.allow_original_download });
  if (result.error) return rpcErrorResponse(result.error);
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
