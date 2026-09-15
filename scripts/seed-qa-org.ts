import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createServiceSupabaseClient } from "../lib/supabase/service";

loadEnvConfig(process.cwd());
export const QA_ORG_ID = "faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const QA_TRAILER_DEPT_ID = "fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const QA_TRAILER_SOURCE_ID = "fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01";
export const QA_TRAILER_DECISIONS = [1, 2, 3, 4, 5, 6].map((n) => `fddddddd-dddd-4ddd-8ddd-dddddddddd0${n}`);

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function ensureUser(client: ReturnType<typeof createServiceSupabaseClient>, prefix: string, displayName: string) {
  const email = required(`${prefix}_EMAIL`).toLowerCase();
  const password = required(`${prefix}_PASSWORD`);
  let existingId: string | undefined;
  for (let page = 1; ; page++) {
    const result = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new Error("qa user lookup failed");
    existingId = result.data.users.find((user) => user.email?.toLowerCase() === email)?.id;
    if (existingId || result.data.users.length < 1000) break;
  }
  const attributes = { email, password, email_confirm: true, user_metadata: { display_name: displayName } };
  const result = existingId ? await client.auth.admin.updateUserById(existingId, attributes) : await client.auth.admin.createUser(attributes);
  if (result.error || !result.data.user) throw new Error("qa user setup failed");
  return result.data.user.id;
}

async function seedTrailerQa(client: ReturnType<typeof createServiceSupabaseClient>) {
  if (!process.env.SEED_QA_LEAD_EMAIL) return;
  const leadEmail = required("SEED_QA_LEAD_EMAIL").toLowerCase();
  if ([required("SEED_ORG_ADMIN_EMAIL"), required("SEED_INVITEE_EMAIL")].some((email) => email.toLowerCase() === leadEmail)) throw new Error("qa accounts must be distinct");
  const leadId = await ensureUser(client, "SEED_QA_LEAD", "QA 예고편 부서장");
  const dept = await client.from("departments").upsert({ id: QA_TRAILER_DEPT_ID, org_id: QA_ORG_ID, name: "QA 예고편" }, { onConflict: "id" });
  if (dept.error) throw new Error("qa trailer dept failed");
  const member = await client.from("members").upsert({ user_id: leadId, dept_id: QA_TRAILER_DEPT_ID, role: "lead", display_name: "QA 예고편 부서장", consented_at: new Date().toISOString(), consent_version: 1 }, { onConflict: "user_id,dept_id" });
  if (member.error) throw new Error("qa trailer lead failed");
  if (process.argv.includes("--reset")) {
    for (const table of ["trailers", "trailer_generation_counters"]) {
      const result = await client.from(table).delete().eq("dept_id", QA_TRAILER_DEPT_ID);
      if (result.error) throw new Error("qa trailer reset failed");
    }
  }
  const flag = await client.from("orgs").update({ trailer_publish_enabled: false }).eq("id", QA_ORG_ID);
  if (flag.error) throw new Error("qa trailer flag failed");
  const source = await client.from("sources").upsert({ id: QA_TRAILER_SOURCE_ID, dept_id: QA_TRAILER_DEPT_ID, kind: "notion_page", external_id: "qa-trailer-principles", title: "합성 업무 원칙", is_principles: true, visibility: "dept", active: true }, { onConflict: "id" });
  if (source.error) throw new Error("qa trailer source failed");
  const texts = ["일정의 제약을 먼저 확인하고 작은 범위로 시작한다.", "관계자의 조건을 기록하고 감수한 점을 결정 이유에 남긴다."];
  const chunks = await client.from("items").upsert(texts.map((content, i) => ({ id: `fccccccc-cccc-4ccc-8ccc-cccccccccc0${i + 1}`, dept_id: QA_TRAILER_DEPT_ID, source_id: QA_TRAILER_SOURCE_ID, external_ref: `qa-principle-${i}`, content })), { onConflict: "id" });
  if (chunks.error) throw new Error("qa trailer items failed");
  for (let i = 0; i < QA_TRAILER_DECISIONS.length; i++) {
    const exists = await client.from("decisions").select("id").eq("id", QA_TRAILER_DECISIONS[i]).maybeSingle();
    if (exists.error) throw new Error("qa decision lookup failed"); if (exists.data) continue;
    const decision = await client.from("decisions").insert({ id: QA_TRAILER_DECISIONS[i], dept_id: QA_TRAILER_DEPT_ID, visibility: i === 3 ? "leads_only" : "dept", decided_by: leadId, decided_by_name: "QA 예고편 부서장", outcome: [`작은 범위로 첫 실험을 시작합니다.`, `검토 기간을 확보하고 순서를 정합니다.`, `후속 연락 책임을 나눠 기록합니다.`, `비공개 예산 조건을 확인합니다.`, `이전 범위로 진행합니다.`, `확인한 범위로 정정합니다.`][i], rationale: "관계자의 제약을 확인하고 다음 단계를 준비하기 위한 합성 결정입니다.", supersedes_id: i === 5 ? QA_TRAILER_DECISIONS[4] : null });
    if (decision.error) throw new Error("qa trailer decision failed");
  }
}

async function main() {
  const client = createServiceSupabaseClient();
  if (required("SEED_ORG_ADMIN_EMAIL").toLowerCase() === required("SEED_INVITEE_EMAIL").toLowerCase()) throw new Error("qa accounts must be distinct");
  const org = await client.from("orgs").upsert({ id: QA_ORG_ID, name: "사수 QA", is_demo: false }, { onConflict: "id" });
  if (org.error) throw new Error("qa org setup failed");
  const adminId = await ensureUser(client, "SEED_ORG_ADMIN", "QA 조직 관리자");
  const inviteeId = await ensureUser(client, "SEED_INVITEE", "QA 초대 대상");
  const grant = await client.from("org_admins").upsert({ org_id: QA_ORG_ID, user_id: adminId, granted_by: "script:seed-qa-org" }, { onConflict: "org_id,user_id" });
  if (grant.error) throw new Error("qa org admin grant failed");
  let revoked = 0;
  if (process.argv.includes("--reset")) {
    const pending = await client.from("member_invites").select("id").eq("org_id", QA_ORG_ID).is("accepted_at", null).is("revoked_at", null);
    if (pending.error) throw new Error("qa pending invite lookup failed");
    for (const invite of pending.data) {
      const result = await client.from("member_invites").update({ revoked_at: new Date().toISOString(), used_token_hash: null, token_hash: `revoked:${randomUUID()}` }).eq("org_id", QA_ORG_ID).eq("id", invite.id).is("accepted_at", null).is("revoked_at", null);
      if (result.error) throw new Error("qa invite reset failed");
      revoked++;
    }
    const departments = await client.from("departments").select("id").eq("org_id", QA_ORG_ID);
    if (departments.error) throw new Error("qa department lookup failed");
    if (departments.data.length) {
      const result = await client.from("members").delete().eq("user_id", inviteeId).in("dept_id", departments.data.map((dept) => dept.id));
      if (result.error) throw new Error("qa membership reset failed");
    }
  }
  await seedTrailerQa(client);
  console.log(JSON.stringify({ org_id: QA_ORG_ID, admin_id: adminId, invitee_id: inviteeId, revoked }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "qa seed failed"); process.exitCode = 1; });
}
