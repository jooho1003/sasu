import { z } from "zod";
import { after } from "next/server";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { runWorkerOnce } from "@/lib/worker";
export async function POST(_request: Request, { params }: { params: Promise<{ dept: string; id: string }> }) {
  const { dept, id } = await params; if (!z.uuid().safeParse(id).success) return Response.json({ error: "연결을 찾지 못했습니다." }, { status: 404 });
  await requireMembership(dept);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const result = await (await createServerSupabaseClient()).rpc("queue_retro_pull", { p_connection: id, p_date: date });
  if (result.error) return Response.json({ error: "자료를 가져오지 못했습니다." }, { status: 400 });
  after(runWorkerOnce);
  return Response.json({ queued: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
