import { trailerLead, trailerError, type TrailerRouteContext } from "../_shared";
export async function GET(_request: Request, context: TrailerRouteContext) {
  const auth = await trailerLead(context); if (auth instanceof Response) return auth;
  const result = await auth.supabase.rpc("trailer_candidates", { p_dept: auth.membership.deptId });
  return result.error ? trailerError(result.error) : Response.json({ candidates: result.data ?? [] });
}
