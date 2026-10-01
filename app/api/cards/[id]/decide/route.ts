import { decideCard, readCardDept, type DecideBody } from "@/lib/card-decide";
import { actorFromMembership } from "@/lib/companion/context";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const deptId = await readCardDept(supabase, id);
  if (!deptId) return Response.json({ error: "결정 카드를 찾을 수 없습니다." }, { status: 404 });
  const membership = await requireMembership(deptId);
  let body: DecideBody;
  try {
    body = (await request.json()) as DecideBody;
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const result = await decideCard(actorFromMembership(supabase, membership), id, body);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result.body, { status: result.status });
}
