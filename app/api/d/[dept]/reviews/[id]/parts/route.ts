import { kickWorker } from "@/lib/jobs";
import { reviewError } from "@/lib/reviews";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string; id: string }> },
) {
  const { dept, id } = await params;
  const member = await requireMembership(dept);
  const client = await createServerSupabaseClient();
  const own = await client
    .from("reviewed_materials")
    .select("id")
    .eq("id", id)
    .eq("dept_id", member.deptId)
    .maybeSingle();
  if (!own.data)
    return Response.json(
      { error: "자료를 찾을 수 없습니다." },
      { status: 404 },
    );
  const body = await request.json().catch(() => null);
  if (!Number.isInteger(body?.index) || body.index < 0 || body.index > 29)
    return Response.json(
      { error: "변환 구간을 확인해 주세요." },
      { status: 400 },
    );
  const result = await client.rpc("queue_review_part", {
    p_review: id,
    p_index: body.index,
  });
  if (result.error) {
    const error = reviewError(result.error);
    return Response.json(error, { status: error.status });
  }
  kickWorker();
  return Response.json({ job_id: result.data }, { status: 202 });
}
