import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

async function main() {
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const orgId = process.env.SASU_SHOWCASE_ORG_ID?.trim() ??
  "11111111-1111-4111-8111-111111111111";

if (!url || !key) throw new Error("Supabase 감사 환경 변수가 없습니다.");
if (!/^[0-9a-f-]{36}$/iu.test(orgId)) throw new Error("쇼케이스 조직 ID 형식이 올바르지 않습니다.");

const client = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const departments = await client
  .from("departments")
  .select("id, name")
  .eq("org_id", orgId);
if (departments.error) throw new Error("쇼케이스 부서 조회 실패");

const departmentIds = departments.data.map((department) => department.id);
const findings: Array<{ kind: string; count: number; ids: string[] }> = [];

async function collect(
  kind: string,
  table: "items" | "answers" | "decisions",
  column: "content" | "question" | "outcome",
  pattern: string,
) {
  if (departmentIds.length === 0) return;
  const result = await client
    .from(table)
    .select("id")
    .in("dept_id", departmentIds)
    .ilike(column, pattern)
    .limit(100);
  if (result.error) throw new Error(`${kind} 감사 실패`);
  if (result.data.length > 0) {
    findings.push({ kind, count: result.data.length, ids: result.data.map((row) => row.id) });
  }
}

const suspiciousDepartments = departments.data.filter((department) =>
  /(?:^|[-_ ])(?:e2e|qa)(?:$|[-_ ])/iu.test(department.name),
);
if (suspiciousDepartments.length > 0) {
  findings.push({
    kind: "department_name",
    count: suspiciousDepartments.length,
    ids: suspiciousDepartments.map((department) => department.id),
  });
}

for (const pattern of ["%[QA-%", "%[합성 QA%", "%E2E-%"]) {
  await collect(`item:${pattern}`, "items", "content", pattern);
  await collect(`answer:${pattern}`, "answers", "question", pattern);
  await collect(`decision:${pattern}`, "decisions", "outcome", pattern);
}

console.log(JSON.stringify({ org_id: orgId, department_count: departmentIds.length, findings }, null, 2));
if (findings.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "쇼케이스 데이터 감사 실패");
  process.exitCode = 1;
});
