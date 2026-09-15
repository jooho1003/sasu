import { createTrailer, trailerLead, trailerError, type TrailerRouteContext } from "./_shared";
export const POST = createTrailer;
export async function GET(_request: Request, context: TrailerRouteContext) {
  const auth = await trailerLead(context); if (auth instanceof Response) return auth;
  const result = await auth.supabase.from("trailers").select("id,status,status_reason,scenarios,published_at,slug,updated_at").eq("dept_id", auth.membership.deptId).order("created_at", { ascending: false });
  if (result.error) return trailerError(result.error);
  return Response.json({ trailers: (result.data ?? []).map((row) => ({ id: row.id, status: row.status, status_reason: row.status_reason, title: Array.isArray(row.scenarios) && typeof row.scenarios[0]?.title === "string" ? row.scenarios[0].title : "새 예고편", published_at: row.published_at, slug: row.slug, updated_at: row.updated_at })) });
}
