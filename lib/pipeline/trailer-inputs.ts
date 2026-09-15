import type { createServiceSupabaseClient } from "@/lib/supabase/service";

export type TrailerInputRow = { org_id: string; dept_id: string; source_decision_ids: string[]; banned_terms: string[] };
type Decision = { id: string; dept_id: string; visibility: string; outcome: string; rationale: string; request_id: string | null };
type Source = { id: string; title: string | null; is_principles: boolean; active: boolean; visibility: string };

export function trailerFailure(errorCode: string): Error & { error_code: string } {
  return Object.assign(new Error(errorCode), { error_code: errorCode });
}

export async function loadTrailerInputs(client: ReturnType<typeof createServiceSupabaseClient>, trailer: TrailerInputRow) {
  const decisions = await client.from("decisions").select("id,outcome,rationale,request_id,dept_id,visibility").in("id", trailer.source_decision_ids);
  if (decisions.error) throw trailerFailure("job_failed");
  const rows = (decisions.data ?? []) as Decision[];
  if (rows.length !== trailer.source_decision_ids.length || rows.some((row) => row.dept_id !== trailer.dept_id || row.visibility !== "dept")) throw trailerFailure("trailer_decisions_invalid");
  const cardIds = rows.flatMap((row) => row.request_id ? [row.request_id] : []);
  const [cards, sources, members, department, org] = await Promise.all([
    cardIds.length ? client.from("decision_requests").select("id,title").in("id", cardIds).eq("dept_id", trailer.dept_id) : Promise.resolve({ data: [], error: null }),
    client.from("sources").select("id,title,is_principles,active,visibility").eq("dept_id", trailer.dept_id),
    client.from("members").select("display_name").eq("dept_id", trailer.dept_id),
    client.from("departments").select("name").eq("id", trailer.dept_id).maybeSingle(),
    client.from("orgs").select("name").eq("id", trailer.org_id).maybeSingle(),
  ]);
  if ([cards, sources, members, department, org].some((result) => result.error)) throw trailerFailure("job_failed");
  const sourceRows = (sources.data ?? []) as Source[];
  const principleIds = sourceRows.filter((source) => source.is_principles && source.active && source.visibility === "dept").map((source) => source.id);
  const chunks = principleIds.length ? await client.from("items").select("content").eq("dept_id", trailer.dept_id).in("source_id", principleIds).is("deleted_at", null).order("created_at", { ascending: true }) : { data: [], error: null };
  if (chunks.error) throw trailerFailure("job_failed");
  return {
    decisions: trailer.source_decision_ids.map((id) => {
      const row = rows.find((decision) => decision.id === id)!;
      return { id: row.id, outcome: row.outcome, rationale: row.rationale, cardTitle: cards.data?.find((card) => card.id === row.request_id)?.title as string | null ?? null };
    }),
    principles: (chunks.data ?? []).map((item) => item.content as string),
    properNouns: [...trailer.banned_terms, ...sourceRows.flatMap((source) => source.title ? [source.title] : []), ...(members.data ?? []).map((member) => member.display_name as string), department.data?.name, org.data?.name].filter((name): name is string => typeof name === "string"),
  };
}
