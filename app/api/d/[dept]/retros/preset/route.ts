import { z } from "zod";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { enabled, fail, noStore, readBody } from "../_shared";
const Input = z.strictObject({ preset: z.enum(["development", "planning", "design", "sales", "cs", "marketing", "hr", "general"]) });
export async function PATCH(request: Request, { params }: { params: Promise<{ dept: string }> }) {
  if (!enabled()) return fail("retro_not_found");
  const body = await readBody(request); if (body instanceof Response) return body;
  const { dept } = await params, member = await requireMembership(dept), input = Input.safeParse(body);
  if (!input.success || member.role !== "lead") return Response.json({ error: "설정을 바꿀 수 없습니다." }, { status: 403 });
  const result = await (await createServerSupabaseClient()).rpc("set_retro_preset", { p_dept: member.deptId, p_preset: input.data.preset });
  return result.error ? fail(result.error) : new Response(null, { status: 204, headers: noStore });
}
