import { DecisionCorrectionInput } from "@/lib/contracts";
import { mask } from "@/lib/mask";
import { kickWorker } from "@/lib/jobs";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ dept: string }> }) {
  const membership = await requireMembership((await params).dept);
  const body = DecisionCorrectionInput.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "정정할 결정과 결과·사유를 확인해주세요." }, { status: 400 });
  const client = await createServerSupabaseClient();
  const result = await client.rpc("correct_decision", { p_dept: membership.deptId, p_previous: body.data.previous_id, p_id: body.data.correction_id, p_outcome: mask(body.data.outcome), p_rationale: mask(body.data.rationale) });
  if (result.error) {
    const conflict = result.error.code === "23505";
    return Response.json({ error: conflict ? "이미 정정된 결정입니다. 원장을 새로고침해주세요." : "결정을 정정할 수 없습니다. 권한과 동의 상태를 확인해주세요." }, { status: conflict ? 409 : result.error.code === "42501" ? 403 : 500 });
  }
  kickWorker();
  return Response.json({ id: result.data }, { status: 201 });
}
