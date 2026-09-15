/** O12 only: npx tsx scripts/score-demo-attempts.ts --trailer <DEMO_TRAILER_ID> --out fixtures/trailer/demo-attempts.snapshot.json */
import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { createServiceSupabaseClient } from "../lib/supabase/service";
import { parsePublicTrailer } from "../lib/trailer-public";
import { buildSyntheticAttempts } from "../lib/trailer-synthetic";
import { enqueue } from "../lib/jobs";
import { runWorkerOnce } from "../lib/worker";
loadEnvConfig(process.cwd());
async function main() {
  const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
  const trailerId=z.uuid().parse(arg("--trailer")),output=resolve(arg("--out")??"fixtures/trailer/demo-attempts.snapshot.json");
  const client=createServiceSupabaseClient(); const row=await client.from("trailers").select("org_id,status,scenarios,apply_url").eq("id",trailerId).single();if(row.error||row.data.status!=="published")throw new Error("published_demo_required");
  const org=await client.from("orgs").select("is_demo").eq("id",row.data.org_id).single();if(org.error||!org.data.is_demo)throw new Error("demo_org_required");
  const parsed=parsePublicTrailer({scenarios:row.data.scenarios,apply_url:row.data.apply_url});if(parsed.status!=="ok")throw new Error("invalid_scenarios");
  const attempts=buildSyntheticAttempts(trailerId,parsed.scenarios);
  for(const attempt of attempts){const created=await client.rpc("create_trailer_attempt",{p_attempt_id:attempt.id,p_trailer:trailerId,p_kind:"synthetic",p_label:attempt.label,p_submissions:attempt.submissions});if(created.error)throw new Error("attempt_create_failed");const version=created.data?.[0]?.updated_at;if(!version)throw new Error("attempt_create_failed");await enqueue("score_trailer_attempt",{attemptId:attempt.id},{dedupeKey:`${attempt.id}:${version}`});}
  const deadline=Date.now()+5*60_000;let rows;
  while(Date.now()<deadline){await runWorkerOnce();const result=await client.from("trailer_attempts").select("id,kind,label,submissions,status,result,weighted_score").in("id",attempts.map(a=>a.id));if(result.error)throw new Error("attempt_read_failed");rows=result.data;if(rows.length===3&&rows.every(r=>r.status!=="scoring"))break;await delay(1500);}
  if(!rows||rows.some(r=>r.status==="scoring")){process.exitCode=2;console.error("attempt_timeout");return;}
  rows.sort((a,b)=>a.label.localeCompare(b.label));await mkdir(dirname(output),{recursive:true});await writeFile(output,`${JSON.stringify({schema_version:1,trailer_id:trailerId,attempts:rows},null,2)}\n`,"utf8");
  for(const row of rows)console.log(JSON.stringify({label:row.label,status:row.status,criteria_count:row.result?.criteria?.length??0}));if(rows.some(r=>r.status!=="scored"))process.exitCode=2;
}
main().catch(()=>{console.error("demo_attempt_scoring_failed");process.exitCode=1;});
