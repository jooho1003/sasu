import { z } from "zod";

import { kickWorker } from "@/lib/jobs";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const RevisionRequest = z.strictObject({ request_id: z.uuid() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string; taskId: string }> },
) {
  const { dept, taskId } = await params;
  const membership = await requireMembership(dept);
  if (!membership.consentedAt) return Response.json({ error: "동의 후 이용할 수 있습니다." }, { status: 403 });
  if (!z.uuid().safeParse(taskId).success) return Response.json({ error: "이전 작업 번호를 확인해 주세요." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "요청 형식을 확인해 주세요." }, { status: 400 }); }
  const parsed = RevisionRequest.safeParse(body);
  if (!parsed.success) return Response.json({ error: "요청 번호를 확인해 주세요." }, { status: 400 });
  const client = await createServerSupabaseClient();
  const result = await client.rpc("request_sales_review_revision", {
    p_dept: membership.deptId,
    p_parent: taskId,
    p_request_id: parsed.data.request_id,
  });
  if (result.error) {
    if (result.error.message.includes("sales_review_revision_forbidden")) return Response.json({ error: "이 검토안에서 다시 요청할 수 없습니다." }, { status: 403 });
    if (result.error.message.includes("sales_review_daily_limit")) return Response.json({ error: "오늘 가상 검토 한도 10건에 도달했습니다." }, { status: 429 });
    if (result.error.message.includes("sales_review_revision_invalid")) return Response.json({ error: "재검토 요청을 확인해 주세요." }, { status: 400 });
    return Response.json({ error: "다시 검토를 시작하지 못했습니다." }, { status: 500 });
  }
  kickWorker();
  return Response.json({ task_id: result.data }, { status: 202 });
}
