import { z } from "zod";
import { RetroEdit } from "@/lib/contracts";
import { RETRO_SECTIONS, verifyRetroDraft } from "@/lib/retro/verify";
import { kickWorker } from "@/lib/jobs";
import { accessible, detail, fail, noStore, readBody, type Context } from "../_shared";
export async function GET(_request: Request, context: Context) {
  const data = await detail(context); if (data instanceof Response) return data;
  const { day, activities, revision, confirmed, owner, preset } = data;
  const timedOut = day.status === "drafting" && Date.now() - Date.parse(day.updated_at) > 120000;
  return Response.json({ day: owner && timedOut ? { ...day, status: "failed", status_reason: "llm_timeout" } : day, activities, revision, confirmed, owner, preset }, { headers: noStore });
}
export async function PATCH(request: Request, context: Context) {
  const data = await detail(context); if (data instanceof Response) return data;
  if (!data.owner) return fail("retro_not_found");
  const body = await readBody(request); if (body instanceof Response) return body;
  const input = RetroEdit.safeParse(body); if (!input.success) return fail("invalid_retro");
  const verified = verifyRetroDraft({ ...input.data, highlight: null, citations: RETRO_SECTIONS.flatMap(s => input.data.body[s].flatMap(i => i.citations)) }, data.activities);
  if (verified.dropped) return fail("citation_invalid");
  const result = await data.client.rpc("save_retro", { p_day: data.day.id, p_revision: input.data.revision, p_title: verified.title, p_body: verified.body, p_topics: verified.topics });
  return result.error ? fail(result.error) : Response.json({ revision: result.data }, { headers: noStore });
}
const Action = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("confirm"), revision: z.number().int().nonnegative() }),
  z.strictObject({ action: z.literal("regenerate") }),
  z.strictObject({ action: z.literal("exclude"), activity_id: z.uuid(), excluded: z.boolean() }),
  z.strictObject({ action: z.literal("visibility"), visibility: z.enum(["self", "dept", "leads_only"]) }),
  z.strictObject({ action: z.literal("delete") }),
]);
export async function POST(request: Request, context: Context) {
  const data = await accessible(context); if (data instanceof Response) return data;
  if (!data.owner) return fail("retro_not_found");
  const body = await readBody(request); if (body instanceof Response) return body;
  const input = Action.safeParse(body); if (!input.success) return fail("invalid_retro");
  const p = input.data;
  const name = { confirm: "confirm_retro", regenerate: "regenerate_retro", exclude: "exclude_retro_activity", visibility: "set_retro_visibility", delete: "delete_retro_day" }[p.action];
  const args = { p_day: data.day.id, ...(p.action === "confirm" ? { p_revision: p.revision } : p.action === "exclude" ? { p_activity: p.activity_id, p_excluded: p.excluded } : p.action === "visibility" ? { p_visibility: p.visibility } : {}) };
  const result = await data.client.rpc(name, args);
  if (result.error) return fail(result.error);
  if (p.action === "regenerate") kickWorker();
  return Response.json({ ok: true }, { headers: noStore });
}
