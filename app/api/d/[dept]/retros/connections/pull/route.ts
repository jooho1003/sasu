import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { kickWorker } from "@/lib/jobs";
import { metadataBase } from "@/lib/site";
import { enabled, fail, noStore } from "../../_shared";

export async function POST(request: Request, { params }: { params: Promise<{ dept: string }> }) {
  if (!enabled()) return fail("retro_not_found");
  if (request.headers.get("origin") !== metadataBase().origin) return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403, headers: noStore });
  const { dept } = await params, member = await requireMembership(dept), client = await createServerSupabaseClient();
  const result = await client.rpc("queue_retro_pulls", { p_dept: member.deptId });
  if (result.error) return fail(result.error);
  if (result.data > 0) kickWorker();
  return Response.json({ queued: result.data }, { status: 202, headers: noStore });
}
