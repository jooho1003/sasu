import { notFound } from "next/navigation";
import { connection } from "next/server";
import { TrailerGateReport, TrailerScenario } from "@/lib/contracts";
import { trailerPublishEnabled } from "@/lib/features";
import { requirePageMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TrailerOriginal } from "@/components/trailers/views";
import type { AttemptScoreRow } from "@/components/trailers/attempt-scores";
export async function trailerPageContext(dept: string, suffix = "") {
  await connection();
  if (!trailerPublishEnabled()) notFound();
  const membership = await requirePageMembership(dept, `/d/${dept}/trailers${suffix}`);
  return { membership, supabase: await createServerSupabaseClient() };
}
export async function trailerOriginals(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, dept: string, ids: string[]) {
  const [decisions, sources] = await Promise.all([
    supabase.from("decisions").select("id,outcome,rationale,request_id").eq("dept_id", dept).in("id", ids),
    supabase.from("sources").select("title").eq("dept_id", dept).eq("active", true).eq("is_principles", true).eq("visibility", "dept"),
  ]);
  if (decisions.error || sources.error) return null;
  const cardIds = (decisions.data ?? []).map((row) => row.request_id).filter(Boolean);
  const cards = cardIds.length ? await supabase.from("decision_requests").select("id,title").eq("dept_id", dept).in("id", cardIds) : { data: [], error: null };
  if (cards.error) return null;
  const originals: TrailerOriginal[] = ids.flatMap((id) => { const row = decisions.data?.find((d) => d.id === id); return row ? [{ id, outcome: row.outcome, rationale: row.rationale, title: cards.data?.find((card) => card.id === row.request_id)?.title ?? null }] : []; });
  return { originals, principles: (sources.data ?? []).map((source) => source.title as string) };
}
export function parsedTrailer(row: Record<string, unknown>) {
  const scenarios = TrailerScenario.array().safeParse(row.scenarios ?? []);
  const report = TrailerGateReport.safeParse(row.gate_report);
  return { scenarios: scenarios.success ? scenarios.data : [], gate_report: report.success ? report.data : null };
}
export async function readTrailerAttempts(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, trailerId: string): Promise<AttemptScoreRow[] | null> {
  const result = await supabase.from("trailer_attempts").select("id,label,created_at,submissions,result,weighted_score,status,status_reason").eq("trailer_id",trailerId).eq("kind","synthetic").order("created_at",{ascending:true});
  if(result.error)return null;
  return (result.data??[]).map(row=>({id:row.id,label:row.label,createdAt:row.created_at,submissions:row.submissions,result:row.result,weightedScore:row.weighted_score===null?null:Number(row.weighted_score),status:row.status,statusReason:row.status_reason}));
}
