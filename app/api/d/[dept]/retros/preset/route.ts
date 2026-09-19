import { z } from "zod";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
const Input = z.strictObject({ preset: z.enum(["development", "planning", "design", "sales", "cs", "marketing", "hr", "general"]) });
export async function PATCH(request: Request, { params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params, member = await requireMembership(dept), input = Input.safeParse(await request.json().catch(() => null));
  if (!input.success || member.role !== "lead") return Response.json({ error: "설정을 바꿀 수 없습니다." }, { status: 403 });
  const result = await (await createServerSupabaseClient()).rpc("set_retro_preset", { p_dept: member.deptId, p_preset: input.data.preset });
  return result.error ? Response.json({ error: "회고 방식을 저장하지 못했습니다." }, { status: 400 }) : new Response(null, { status: 204 });
}
