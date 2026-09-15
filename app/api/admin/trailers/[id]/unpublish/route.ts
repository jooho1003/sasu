import { orgAdminWritesEnabled, trailerPublishEnabled } from "@/lib/features";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { trailerError, trailerNotFound } from "@/app/api/d/[dept]/trailers/_shared";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!orgAdminWritesEnabled() || !trailerPublishEnabled()) return trailerNotFound();
  const { id } = await params;
  const result = await (await createServerSupabaseClient()).rpc("admin_unpublish_trailer", { p_trailer: id });
  return result.error ? trailerError(result.error) : Response.json({ ok: true });
}
