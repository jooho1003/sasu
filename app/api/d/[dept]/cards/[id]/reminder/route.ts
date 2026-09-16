import { CardReminderInput } from "@/lib/contracts";
import { kickWorker } from "@/lib/jobs";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ dept: string; id: string }> };
async function context(input: Context) {
  const { dept, id } = await input.params;
  const membership = await requireMembership(dept);
  const client = await createServerSupabaseClient();
  const card = await client.from("decision_requests").select("id").eq("dept_id", membership.deptId).eq("id", id).maybeSingle();
  return { client, id, valid: !card.error && !!card.data };
}
export async function GET(_request: Request, input: Context) {
  const { client, id, valid } = await context(input);
  if (!valid) return Response.json({ error: "결정 카드를 찾지 못했습니다." }, { status: 404 });
  const result = await client.from("card_reminders").select("id, kind, scheduled_for, state, sent_at, last_error").eq("request_id", id).order("scheduled_for", { ascending: false });
  if (result.error) return Response.json({ error: "알림을 불러오지 못했습니다." }, { status: 500 });
  return Response.json({ reminders: result.data ?? [] });
}
export async function POST(request: Request, input: Context) {
  const { client, id, valid } = await context(input);
  if (!valid) return Response.json({ error: "결정 카드를 찾지 못했습니다." }, { status: 404 });
  const body = CardReminderInput.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "알림 날짜를 확인해주세요." }, { status: 400 });
  const result = await client.rpc("set_card_reminder", { p_request: id, p_at: body.data.scheduled_for });
  if (result.error) return Response.json({ error: "담당자나 부서장만 90일 이내의 미래 날짜로 예약할 수 있습니다." }, { status: result.error.code === "42501" ? 403 : 400 });
  kickWorker();
  return Response.json({ ok: true });
}
