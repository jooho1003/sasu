import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { kickWorker } from "@/lib/jobs";

type Context = { params: Promise<{ dept: string }> };
export async function GET(_request: Request, context: Context) {
  const membership = await requireMembership((await context.params).dept);
  const client = await createServerSupabaseClient();
  const result = await client.rpc("my_slack_questions", { p_dept: membership.deptId });
  if (result.error) return Response.json({ error: "Slack 질문을 불러오지 못했습니다." }, { status: 500 });
  return Response.json({ questions: result.data ?? [] });
}

export async function POST(request: Request, context: Context) {
  const membership = await requireMembership((await context.params).dept);
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 }); }
  const answerId = body && typeof body === "object" && "answerId" in body ? body.answerId : null;
  if (typeof answerId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(answerId))
    return Response.json({ error: "질문을 선택해 주세요." }, { status: 400 });
  const client = await createServerSupabaseClient();
  const result = await client.rpc("retry_my_slack_answer", { p_dept: membership.deptId, p_answer: answerId });
  if (result.error) return Response.json({ error: "다시 보낼 수 없는 질문입니다." }, { status: result.error.code === "42501" ? 403 : 500 });
  if (result.data !== true) return Response.json({ error: "이미 전송 중이거나 다시 보낼 필요가 없는 질문입니다." }, { status: 409 });
  kickWorker();
  return Response.json({ ok: true }, { status: 202 });
}
