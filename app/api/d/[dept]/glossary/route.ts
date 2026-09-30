import { z } from "zod";
import { DeptGlossaryInput } from "@/lib/contracts";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ dept: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  const client = await createServerSupabaseClient();
  const result = await client.from("dept_glossaries")
    .select("id,term,reading,note,updated_at")
    .eq("dept_id", membership.deptId)
    .order("updated_at", { ascending: false });
  if (result.error) return Response.json({ error: "용어집을 불러오지 못했습니다." }, { status: 500 });
  return Response.json({ entries: result.data ?? [], can_edit: membership.role === "lead" },
    { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request, { params }: Context) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") return Response.json({ error: "팀장만 용어를 바꿀 수 있습니다." }, { status: 403 });
  const parsed = DeptGlossaryInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "용어 정보를 확인해 주세요." }, { status: 400 });
  const client = await createServerSupabaseClient();
  const result = await client.rpc("save_dept_glossary", {
    p_dept: membership.deptId,
    p_id: parsed.data.id,
    p_term: parsed.data.term,
    p_reading: parsed.data.reading,
    p_note: parsed.data.note,
  });
  if (result.error) {
    const duplicate = result.error.code === "23505";
    const invalid = result.error.code === "22023";
    return Response.json({ error: duplicate ? "이미 등록된 용어입니다." : invalid ? "연락처 등 개인정보를 뺀 용어를 적어 주세요." : "용어를 저장하지 못했습니다." },
      { status: duplicate ? 409 : invalid ? 400 : 500 });
  }
  return Response.json({ id: result.data });
}

export async function DELETE(request: Request, { params }: Context) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") return Response.json({ error: "팀장만 용어를 지울 수 있습니다." }, { status: 403 });
  const parsed = z.strictObject({ id: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "용어를 확인해 주세요." }, { status: 400 });
  const client = await createServerSupabaseClient();
  const result = await client.rpc("delete_dept_glossary", { p_dept: membership.deptId, p_id: parsed.data.id });
  if (result.error) return Response.json({ error: "용어를 지우지 못했습니다." }, { status: 500 });
  return Response.json({ deleted: result.data === true });
}
