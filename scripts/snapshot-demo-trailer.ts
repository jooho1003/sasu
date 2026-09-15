/** O11 only: npx tsx scripts/snapshot-demo-trailer.ts --dept <demo dept uuid> --decisions <id,id[,id]> --out fixtures/trailer/demo-trailer.snapshot.json */
import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { createServiceSupabaseClient } from "../lib/supabase/service";
import { loadTrailerInputs } from "../lib/pipeline/trailer-inputs";
import { generateTrailerScenarios } from "../lib/pipeline/trailer-generate";
import { runTrailerGate } from "../lib/trailer-gate";
import { mask } from "../lib/mask";
loadEnvConfig(process.cwd());
async function main() {
  const arg = (name: string) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
  const dept = z.uuid().parse(arg("--dept")); const decisions = z.array(z.uuid()).min(1).max(3).parse(arg("--decisions")?.split(","));
  if (new Set(decisions).size !== decisions.length) throw new Error("decision_ids");
  const output = resolve(arg("--out") ?? "fixtures/trailer/demo-trailer.snapshot.json");
  const client = createServiceSupabaseClient();
  const department = await client.from("departments").select("org_id").eq("id", dept).single();
  if (department.error) throw new Error("demo_department_required");
  const org = await client.from("orgs").select("is_demo").eq("id", department.data.org_id).single();
  if (org.error || org.data.is_demo !== true) throw new Error("demo_org_required");
  const inputs = await loadTrailerInputs(client, { org_id: department.data.org_id, dept_id: dept, source_decision_ids: decisions, banned_terms: [] });
  const scenarios = await generateTrailerScenarios(inputs, { deptId: dept });
  const texts = [...inputs.principles, ...inputs.decisions.flatMap((d) => [d.outcome, d.rationale, ...(d.cardTitle ? [d.cardTitle] : [])])];
  const report = runTrailerGate(scenarios, { sourceTexts: texts.flatMap((text) => [text, mask(text)]), properNouns: inputs.properNouns });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify({ schema_version: 1, dept_id: dept, decision_ids: decisions, scenarios, gate_report: report, generated_at: new Date().toISOString() }, null, 2)}\n`, "utf8");
  console.log(`스냅샷 사례 ${scenarios.length}개 · 검사 위반 ${report.violations.length}건${report.passed ? "" : " — 검토 필요"}`);
  if (!report.passed) process.exitCode = 2;
}
main().catch(() => { console.error("snapshot_failed"); process.exitCode = 1; });
