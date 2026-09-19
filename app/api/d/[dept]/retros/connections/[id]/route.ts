import { z } from "zod";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export async function DELETE(_request: Request, { params }: { params: Promise<{ dept: string; id: string }> }) {
  const { dept, id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "연결을 찾지 못했습니다." }, { status: 404 });
  await requireMembership(dept);
  const client = await createServerSupabaseClient();
  const result = await client.rpc("revoke_retro_connection", { p_connection: id });
  return result.error ? Response.json({ error: "연결을 해제하지 못했습니다." }, { status: 404 }) : new Response(null, { status: 204 });
}
