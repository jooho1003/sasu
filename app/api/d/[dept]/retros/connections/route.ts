import { z } from "zod";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { encryptConnectionSecret } from "@/lib/retro/connection-crypto";

const provider = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/);
const bodySchema = z.strictObject({ provider, account_label: z.string().trim().min(1).max(120), secret: z.string().min(1).max(8000), config: z.record(z.string(), z.union([z.string().max(500), z.number().finite(), z.boolean()])).default({}) });
export async function GET(_request: Request, { params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params, member = await requireMembership(dept), client = await createServerSupabaseClient();
  const result = await client.from("retro_connections").select("id,provider,status,account_label,config,last_pulled_at,last_error,failure_count,created_at,updated_at,revoked_at").eq("dept_id", member.deptId).eq("user_id", member.userId).order("created_at");
  return result.error ? Response.json({ error: "연결 목록을 불러오지 못했습니다." }, { status: 500 }) : Response.json({ connections: result.data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request, { params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params, member = await requireMembership(dept);
  const input = bodySchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "연결 정보를 확인해 주세요." }, { status: 400 });
  try {
    const client = await createServerSupabaseClient();
    const encrypted = encryptConnectionSecret(input.data.secret, member.userId, input.data.provider);
    const result = await client.rpc("create_retro_connection", { p_dept: member.deptId, p_provider: input.data.provider, p_account_label: input.data.account_label, p_config: input.data.config, p_encrypted_secret: encrypted });
    if (result.error) return Response.json({ error: "연결을 저장하지 못했습니다." }, { status: 400 });
    return Response.json({ id: result.data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "연결을 저장하지 못했습니다." }, { status: 400 }); }
}
