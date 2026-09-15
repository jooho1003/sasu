// 사용법:
//   npx tsx scripts/grant-org-admin.ts --email <email> --org <org-uuid> --operator <name> [--revoke]

import { loadEnvConfig } from "@next/env";

import { createServiceSupabaseClient } from "../lib/supabase/service";

loadEnvConfig(process.cwd());

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || null : null;
}

async function findUserId(email: string): Promise<string | null> {
  const supabase = createServiceSupabaseClient();
  for (let page = 1; ; page += 1) {
    const result = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new Error(`사용자 조회 실패: ${result.error.code ?? "unknown"}`);
    const user = result.data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return user.id;
    if (result.data.users.length < 1000) return null;
  }
}

async function main(): Promise<void> {
  const email = argument("--email")?.toLowerCase();
  const orgId = argument("--org");
  const operator = argument("--operator");
  const revoke = process.argv.includes("--revoke");
  if (!email || !orgId || !operator) throw new Error("--email, --org, --operator가 필요합니다.");

  const supabase = createServiceSupabaseClient();
  const userId = await findUserId(email);
  if (!userId) throw new Error("사용자를 찾을 수 없습니다.");
  const org = await supabase.from("orgs").select("id, is_demo").eq("id", orgId).maybeSingle();
  if (org.error || !org.data) throw new Error("조직을 찾을 수 없습니다.");
  if (org.data.is_demo) throw new Error("데모 조직에는 관리자를 지정할 수 없습니다.");

  const result = revoke
    ? await supabase.from("org_admins").delete().eq("org_id", orgId).eq("user_id", userId)
    : await supabase.from("org_admins").upsert(
        { org_id: orgId, user_id: userId, granted_by: `script:${operator}` },
        { onConflict: "org_id,user_id" },
      );
  if (result.error) throw new Error(`조직 관리자 ${revoke ? "해제" : "지정"} 실패: ${result.error.code ?? "unknown"}`);
  console.log(`user_id=${userId} org_id=${orgId} result=${revoke ? "revoked" : "granted"}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
