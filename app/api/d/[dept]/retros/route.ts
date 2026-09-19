import { z } from "zod";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseRetroBundle } from "@/lib/retro/bundle";
import { kickWorker } from "@/lib/jobs";
import { enabled, fail, noStore, readBody } from "./_shared";
type Context = { params: Promise<{ dept: string }> };
export async function GET(request: Request, context: Context) {
  if (!enabled()) return fail("retro_not_found");
  const { dept } = await context.params; const member = await requireMembership(dept);
  const query = new URL(request.url).searchParams;
  const input = z.object({ from: z.iso.date(), to: z.iso.date(), user: z.uuid().nullable(), topic: z.string().max(50).nullable() }).safeParse({ from: query.get("from") ?? "2000-01-01", to: query.get("to") ?? "2100-01-01", user: query.get("mine") === "1" ? member.userId : query.get("user"), topic: query.get("topic") });
  if (!input.success) return fail("invalid_bundle");
  const client = await createServerSupabaseClient();
  const result = await client.rpc("retro_timeline", { p_dept: member.deptId, p_from: input.data.from, p_to: input.data.to, p_user: input.data.user, p_topic: input.data.topic });
  return result.error ? fail(result.error) : Response.json({ days: result.data ?? [], userId: member.userId }, { headers: noStore });
}
export async function POST(request: Request, context: Context) {
  if (!enabled()) return fail("retro_not_found");
  const { dept } = await context.params; const member = await requireMembership(dept);
  if (!member.consentedAt) return fail("consent_required");
  const body = await readBody(request); if (body instanceof Response) return body;
  const input = z.strictObject({ id: z.uuid(), date: z.iso.date(), tz: z.string().max(64), bundle: z.unknown().nullable() }).safeParse(body);
  if (!input.success) return fail("invalid_bundle");
  const bundle = parseRetroBundle(input.data.bundle ?? { version: 1, date: input.data.date, tz: input.data.tz, collected_at: new Date().toISOString(), collector: { name: "sasu-retro-collect", version: "1" }, activities: [] });
  if (!bundle.ok) return fail(bundle.code);
  if (bundle.bundle.date !== input.data.date || bundle.bundle.tz !== input.data.tz) return fail("invalid_bundle");
  const client = await createServerSupabaseClient();
  const result = await client.rpc("create_retro_day", { p_dept: member.deptId, p_day: input.data.id, p_date: input.data.date, p_tz: input.data.tz, p_collector: bundle.bundle.collector.version, p_bundle: bundle.bundle });
  if (result.error) return fail(result.error);
  await client.rpc("derive_retro_activities", { p_day: input.data.id });
  kickWorker();
  return Response.json(result.data, { status: 202, headers: noStore });
}
