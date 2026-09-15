import { TrailerGenerationDraft } from "@/lib/contracts";
import { enqueue, registerHandler } from "@/lib/jobs";
import { llm } from "@/lib/llm";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { validateScenario } from "@/lib/trailer";
import { buildTrailerGeneratePrompt, draftToScenario, selectPrincipleText } from "@/lib/trailer-generation";
import { loadTrailerInputs, trailerFailure, type TrailerInputRow } from "./trailer-inputs";

export async function generateTrailer(trailerId: string): Promise<void> {
  const client = createServiceSupabaseClient();
  const query = await client.from("trailers").select("id,org_id,dept_id,status,updated_at,source_decision_ids,banned_terms").eq("id", trailerId).maybeSingle<TrailerInputRow & { status: string; updated_at: string }>();
  if (query.error) throw trailerFailure("job_failed");
  const trailer = query.data;
  if (!trailer || trailer.status !== "generating") return;
  const inputs = await loadTrailerInputs(client, trailer);
  const scenarios = await generateTrailerScenarios(inputs, { deptId: trailer.dept_id });
  const saved = await client.from("trailers").update({ scenarios, status: "checking" }).eq("id", trailerId).eq("status", "generating").eq("updated_at", trailer.updated_at).select("updated_at").maybeSingle<{ updated_at: string }>();
  if (saved.error) throw trailerFailure("job_failed");
  if (saved.data) await enqueue("check_trailer_gate", { trailerId }, { dedupeKey: `${trailerId}:${saved.data.updated_at}` });
}

export async function generateTrailerScenarios(inputs: Awaited<ReturnType<typeof loadTrailerInputs>>, opts: { deptId: string }) {
  const scenarios = [];
  for (let i = 0; i < inputs.decisions.length; i++) {
    const decision = inputs.decisions[i]; const scenarioId = `scenario_${i + 1}`;
    let scenario;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await llm.structured("trailer_generate", TrailerGenerationDraft, buildTrailerGeneratePrompt({ scenarioId, decision, cardTitle: decision.cardTitle, principles: selectPrincipleText(inputs.principles), previousErrorCode: attempt ? "invalid_scenario" : undefined }), { deptId: opts.deptId });
      try { scenario = validateScenario(draftToScenario(scenarioId, result.data)); break; }
      catch { if (attempt === 1) throw trailerFailure("invalid_scenario"); }
    }
    if (!scenario) throw trailerFailure("invalid_scenario");
    scenarios.push(scenario);
  }
  if (!scenarios.length) throw trailerFailure("trailer_decisions_invalid");
  return scenarios;
}

export function registerTrailerGenerateHandler() {
  registerHandler("generate_trailer", async (payload: unknown) => {
    const id = payload && typeof payload === "object" ? Reflect.get(payload, "trailerId") : null;
    if (typeof id !== "string" || !id) throw trailerFailure("job_failed");
    await generateTrailer(id);
  });
}
