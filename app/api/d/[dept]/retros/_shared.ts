import { z } from "zod";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { retroError } from "@/lib/retro/errors";
import { RetroDayRow, RetroActivityRow, RetroRevisionRow } from "@/lib/contracts";

export const noStore = { "cache-control": "private, no-store" };
export function fail(error: unknown) { const result = retroError(error); return Response.json(result, { status: result.status, headers: noStore }); }
export const enabled = () => process.env.SASU_RETRO_ENABLED === "true";
export async function readBody(request: Request): Promise<unknown | Response> {
  if (Number(request.headers.get("content-length")) > 1048576) return fail("bundle_too_large");
  const reader = request.body?.getReader(); if (!reader) return fail("invalid_bundle");
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 1048576) { await reader.cancel(); return fail("bundle_too_large"); } chunks.push(part.value); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return fail("invalid_bundle"); } finally { reader.releaseLock(); }
}
export type Context = { params: Promise<{ dept: string; id: string }> };
export async function accessible(context: Context) {
  if (!enabled()) return fail("retro_not_found");
  const { dept, id } = await context.params;
  const member = await requireMembership(dept);
  if (!z.uuid().safeParse(id).success) return fail("retro_not_found");
  const client = await createServerSupabaseClient();
  const result = await client.from("retro_days").select("id,dept_id,user_id,retro_date,tz,visibility,status,status_reason,activity_count,revision,confirmed_revision,confirmed_at,topics,generation,updated_at").eq("dept_id", member.deptId).eq("id", id).maybeSingle();
  if (result.error) return fail(result.error);
  const day = RetroDayRow.safeParse(result.data);
  if (!day.success) return fail("retro_not_found");
  return { client, member, day: day.data, owner: day.data.user_id === member.userId };
}
export async function detail(context: Context) {
  const access = await accessible(context); if (access instanceof Response) return access;
  const { client, day, owner } = access;
  const [activityResult, revisionResult, departmentResult] = await Promise.all([
    client.from("retro_activities").select("*").eq("day_id", day.id).order("at"),
    client.from("retro_revisions").select("*").eq("day_id", day.id).in("revision", [...new Set([owner ? day.revision : day.confirmed_revision, day.confirmed_revision].filter((n): n is number => n !== null))]),
    client.from("departments").select("retro_preset").eq("id", day.dept_id).single(),
  ]);
  if (activityResult.error || revisionResult.error || departmentResult.error) return fail("unknown");
  const activities = RetroActivityRow.array().safeParse(activityResult.data);
  const revisions = RetroRevisionRow.array().safeParse(revisionResult.data);
  if (!activities.success || !revisions.success) return fail("unknown");
  return { ...access, preset: departmentResult.data.retro_preset, activities: activities.data, revision: revisions.data.find(r => r.revision === (owner ? day.revision : day.confirmed_revision)) ?? null, confirmed: revisions.data.find(r => r.revision === day.confirmed_revision) ?? null };
}
