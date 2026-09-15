import { AgentRoleCriterion, TrailerScoreDraft } from "@/lib/contracts";
import { registerHandler } from "@/lib/jobs";
import { llm } from "@/lib/llm";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { validateScenario } from "@/lib/trailer";
import { buildTrailerScorePrompt, validateAttemptSubmissions, verifyTrailerScore } from "@/lib/trailer-assessment";
import { weightedScore } from "@/lib/agent-role";
import { trailerFailure } from "./trailer-inputs";
export async function scoreTrailerAttempt(attemptId: string): Promise<void> {
  const client = createServiceSupabaseClient();
  const attempt = await client.from("trailer_attempts").select("id,trailer_id,dept_id,status,updated_at,submissions").eq("id",attemptId).maybeSingle();
  if (attempt.error) throw trailerFailure("job_failed"); if (!attempt.data || attempt.data.status !== "scoring") return;
  const row = attempt.data;
  const trailer = await client.from("trailers").select("scenarios,rubric,schema_version").eq("id",row.trailer_id).maybeSingle();
  if (trailer.error) throw trailerFailure("job_failed"); if (!trailer.data || trailer.data.schema_version !== 1) throw trailerFailure("attempt_invalid");
  let input;
  try { const scenarios = (trailer.data.scenarios as unknown[]).map(validateScenario); const rubric = AgentRoleCriterion.array().min(1).max(6).parse(trailer.data.rubric); input = { scenarios, rubric, submissions: validateAttemptSubmissions(scenarios,row.submissions) }; }
  catch { throw trailerFailure("attempt_invalid"); }
  const draft = await llm.structured("trailer_score",TrailerScoreDraft,buildTrailerScorePrompt(input),{deptId:row.dept_id});
  const result = verifyTrailerScore(draft.data,input);
  const total = weightedScore(result.criteria.map((c)=>({...c,evidence:c.evidence_status})));
  const saved = await client.from("trailer_attempts").update(total === null ? {status:"failed",status_reason:"citation_invalid",result:null,weighted_score:null} : {status:"scored",status_reason:null,result,weighted_score:total}).eq("id",attemptId).eq("status","scoring").eq("updated_at",row.updated_at);
  if (saved.error) throw trailerFailure("job_failed");
}
export function registerTrailerScoreHandler() {
  registerHandler("score_trailer_attempt",async(payload:unknown)=>{const id=payload&&typeof payload==="object"?Reflect.get(payload,"attemptId"):null;if(typeof id!=="string"||!id)throw trailerFailure("attempt_invalid");await scoreTrailerAttempt(id);});
}
