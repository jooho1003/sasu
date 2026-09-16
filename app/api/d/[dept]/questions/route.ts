import { z } from "zod";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ dept: string }> }) {
  const membership = await requireMembership((await params).dept);
  const url = new URL(request.url);
  const before = url.searchParams.get("before"), beforeId = url.searchParams.get("before_id");
  if ((before === null) !== (beforeId === null) || (before !== null && (!z.iso.datetime({ offset: true }).safeParse(before).success || !z.uuid().safeParse(beforeId).success))) {
    return Response.json({ error: "질문 기록의 페이지가 올바르지 않습니다." }, { status: 400 });
  }
  const client = await createServerSupabaseClient();
  const result = await client.rpc("my_question_history", { p_dept: membership.deptId, p_before: before, p_before_id: beforeId });
  if (result.error) return Response.json({ error: "질문 기록을 불러오지 못했습니다." }, { status: 500 });
  const rows = (result.data ?? []) as { id: string; question: string; status: string; created_at: string; parent_id: string | null }[];
  const questions = rows.slice(0, 20), last = questions.at(-1);
  return Response.json({ questions, next: rows.length > 20 && last ? { before: last.created_at, before_id: last.id } : null });
}
