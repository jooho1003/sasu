import { enqueue, registerHandler } from "@/lib/jobs";
import { mask } from "@/lib/mask";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { runTrailerGate } from "@/lib/trailer-gate";
import { loadTrailerInputs, trailerFailure, type TrailerInputRow } from "./trailer-inputs";

export async function checkTrailerGate(trailerId: string): Promise<void> {
  const client = createServiceSupabaseClient();
  const read = () => client.from("trailers").select("id,org_id,dept_id,status,updated_at,scenarios,source_decision_ids,banned_terms").eq("id", trailerId).maybeSingle<TrailerInputRow & { status: string; updated_at: string; scenarios: unknown }>();
  const query = await read();
  if (query.error) throw trailerFailure("job_failed");
  if (!query.data || query.data.status !== "checking") return;
  const trailer = query.data;
  const inputs = await loadTrailerInputs(client, trailer);
  const texts = [...inputs.principles, ...inputs.decisions.flatMap((decision) => [decision.outcome, decision.rationale, ...(decision.cardTitle ? [decision.cardTitle] : [])])];
  const report = runTrailerGate(trailer.scenarios, { sourceTexts: texts.flatMap((text) => [text, mask(text)]), properNouns: inputs.properNouns });
  const result = await client.rpc("record_trailer_gate", { p_trailer: trailerId, p_report: report, p_passed: report.passed, p_seen_updated_at: trailer.updated_at });
  if (result.error) throw trailerFailure("job_failed");
  if (result.data === "stale") {
    const fresh = await read();
    if (fresh.error) throw trailerFailure("job_failed");
    if (fresh.data?.status === "checking") await enqueue("check_trailer_gate", { trailerId }, { dedupeKey: `${trailerId}:${fresh.data.updated_at}` });
  }
}

export function registerTrailerGateHandler() {
  registerHandler("check_trailer_gate", async (payload: unknown) => {
    const id = payload && typeof payload === "object" ? Reflect.get(payload, "trailerId") : null;
    if (typeof id !== "string" || !id) throw trailerFailure("job_failed");
    await checkTrailerGate(id);
  });
}
