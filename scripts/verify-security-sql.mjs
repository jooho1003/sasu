import { verifyRetroSql } from "./verify-retro-sql.mjs";
import { verifyAnswerGroundingSql } from "./verify-answer-grounding-sql.mjs";
import { verifyRetroConnectionsSql } from "./verify-retro-connections-sql.mjs";
import { verifyTrailerAssessmentSql } from "./verify-trailer-assessment-sql.mjs";
import { verifySlackAskSql } from "./verify-slack-ask-sql.mjs";
import { verifySourceLifecycleSql } from "./verify-source-lifecycle-sql.mjs";
import { verifyDecisionFollowupSql } from "./verify-decision-followup-sql.mjs";
import { verifyConversationsSql } from "./verify-conversations-sql.mjs";
import { verifySlackInstallationsSql } from "./verify-slack-installations-sql.mjs";
import { verifyNotionInstallationsSql } from "./verify-notion-installations-sql.mjs";
import { verifyNotionImportV2Sql } from "./verify-notion-import-v2-sql.mjs";
import { verifyNotionRootsSql } from "./verify-notion-roots-sql.mjs";
import { verifyNotionBulkLaneSql } from "./verify-notion-bulk-lane-sql.mjs";
import { verifyNotionPollSql } from "./verify-notion-poll-sql.mjs";
import { verifyReviewedMaterialsSql } from "./verify-reviewed-materials-sql.mjs";
import { verifyReviewAccessSql } from "./verify-review-access-sql.mjs";
import { verifyRecordingSessionsSql } from "./verify-recording-sessions-sql.mjs";
import { verifyRecordingSegmentsSql } from "./verify-recording-segments-sql.mjs";
import { verifyReviewUploadTimeoutSql } from "./verify-review-upload-timeout-sql.mjs";
import { verifySalesReviewSql } from "./verify-sales-review-sql.mjs";
import { verifySalesSourceReviewSql } from "./verify-sales-source-review-sql.mjs";
import { verifyDeviceLinksSql } from "./verify-device-links-sql.mjs";
// Isolated PostgreSQL/WASM checks. Never loads .env or connects to Supabase.
// npm install --prefix <temporary-directory> @electric-sql/pglite@0.5.8 @electric-sql/pglite-pgvector@0.0.9
// node scripts/verify-security-sql.mjs <temporary-directory>
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { verifyTrailerSql } from "./verify-trailer-sql.mjs";

const require = createRequire(resolve(process.argv[2] ?? resolve(tmpdir(), "sasu-pglite-phase36"), "package.json"));
const { PGlite } = require("@electric-sql/pglite");
const { pgcrypto } = require("@electric-sql/pglite/contrib/pgcrypto");
const { vector } = require("@electric-sql/pglite-pgvector");
const db = new PGlite({ extensions: { pgcrypto, vector } });
let passed = 0;
const ids = Object.fromEntries(["org", "dept", "lead", "member", "memberB", "publicSource", "privateSource", "publicItem", "privateItem", "card", "publicCard", "deferredCard", "slackCard", "meeting", "conflict", "decision", "publicDecision", "answer", "memberAnswer", "memberBAnswer", "pending", "failed"].map(key => [key, randomUUID()]));
const backfillIds = Object.fromEntries(["org", "dept", "privateSource", "privateItem", "card", "cardDecision", "directDecision"].map(key => [key, randomUUID()]));
const mergeIds = Object.fromEntries([
  "boundaryDept", "boundarySource", "exactItem", "belowItem", "oldItem", "closedItem",
  "exactCard", "belowCard", "oldCard", "closedCard", "visibilityDept", "visibilitySource",
  "deptItem", "leadItem", "deptCard", "leadCard",
  "limitDept", "limitSource", "limitItem1", "limitItem2", "limitItem3", "limitItem4",
  "limitCard1", "limitCard2", "limitCard3", "limitCard4",
].map(key => [key, randomUUID()]));
const removalIds = Object.fromEntries([
  "source", "item", "request", "demoOrg", "demoDept", "demoSource",
].map(key => [key, randomUUID()]));
const roleIds = Object.fromEntries([
  "deptRole", "privateRole", "archivedRole", "publicDocument", "privateDocument",
  "nonDocumentSource", "otherOrg", "otherDept", "otherDocument", "demoRole",
].map(key => [key, randomUUID()]));
const adminIds = Object.fromEntries([
  "adminA", "adminB", "orgB", "deptB", "memberB", "deptY", "leadY",
  "sourceY", "itemY", "answerY", "cardY", "pendingInvite", "crossBInvite",
  "invitee", "otherInvitee", "emptyDept", "revokedDept", "expiredDept",
].map(key => [key, randomUUID()]));
const oversizedRoleSources = Array.from({ length: 21 }, () => randomUUID());
const q = (sql, params = []) => db.query(sql, params);
const uuidArray = values => `{${values.join(",")}}`;
const cosineVector = similarity => {
  const values = Array(1024).fill(0);
  values[0] = similarity;
  values[1] = Math.sqrt(1 - similarity ** 2);
  return JSON.stringify(values);
};
const collectKeys = (value, keys = new Set()) => {
  if (Array.isArray(value)) value.forEach(item => collectKeys(item, keys));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
  return keys;
};
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
async function asUser(id, fn) {
  await db.exec("set role authenticated");
  await q("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', 'authenticated', false), set_config('request.jwt.claims', $2, false)", [id, JSON.stringify({ sub:id, role:"authenticated" })]);
  try { await fn(); } finally {
    await db.exec("reset role");
    await q("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'service_role', false), set_config('request.jwt.claims', '{}', false)");
  }
}
async function asUserWithEmail(id, email, fn) {
  await db.exec("set role authenticated");
  await q("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', 'authenticated', false), set_config('request.jwt.claims', $2, false)", [id, JSON.stringify({ sub:id, role:"authenticated", email })]);
  try { await fn(); } finally {
    await db.exec("reset role");
    await q("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'service_role', false), set_config('request.jwt.claims', '{}', false)");
  }
}
async function denied(sql, params = []) {
  await assert.rejects(() => q(sql, params), error => error.code === "42501");
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create table auth.sessions(id uuid primary key, user_id uuid);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,service_role;
    grant select,insert on storage.objects to authenticated;
    grant all on storage.objects to service_role;
  `);
  const migrations = readdirSync("supabase/migrations")
    .filter(name => name.endsWith(".sql") && !name.startsWith("0004_"))
    .sort();
  const boundaryMigration = "0017_card_decision_boundaries.sql";
  for (const file of migrations.filter(name => name < boundaryMigration)) {
    await db.exec(readFileSync(resolve("supabase/migrations", file), "utf8"));
    if (file === "0002_can_see_rls.sql") {
      // Reproduce the direct anon EXECUTE grant observed in the hosted project.
      await db.exec("grant execute on function public.can_see(uuid,uuid,text) to anon");
    }
    if (file === "0001_schema_v1.sql") {
      // Supabase grants must precede the hardening migrations. Granting again
      // after the migrations would undo their REVOKEs and invalidate the test.
      await db.exec("grant all on all tables in schema public to anon, authenticated, service_role; grant all on all sequences in schema public to anon, authenticated, service_role");
    }
  }
  await q("insert into orgs(id,name) values ($1,'backfill fixture')", [backfillIds.org]);
  await q("insert into departments(id,org_id,name) values ($1,$2,'backfill fixture')", [backfillIds.dept,backfillIds.org]);
  await q("insert into sources(id,dept_id,kind,external_id,visibility) values ($1,$2,'document','backfill-private','leads_only')", [backfillIds.privateSource,backfillIds.dept]);
  await q("insert into items(id,source_id,dept_id,content) values ($1,$2,$3,'backfill private evidence')", [backfillIds.privateItem,backfillIds.privateSource,backfillIds.dept]);
  await q("insert into decision_requests(id,dept_id,title,background,visibility) values ($1,$2,'backfill card','backfill card','leads_only')", [backfillIds.card,backfillIds.dept]);
  await q("insert into decisions(id,dept_id,request_id,decided_by_name,outcome,rationale) values ($1,$2,$3,'backfill actor','backfill card outcome','backfill reason'),($4,$2,null,'backfill actor','backfill direct outcome','backfill reason')", [backfillIds.cardDecision,backfillIds.dept,backfillIds.card,backfillIds.directDecision]);
  await q("insert into citations(owner_kind,owner_id,item_id,quote) values ('decision',$1,$2,'backfill private evidence')", [backfillIds.directDecision,backfillIds.privateItem]);
  await db.exec(readFileSync(resolve("supabase/migrations", boundaryMigration), "utf8"));
  const orgAdminMigration = "0026_org_admin.sql";
  for (const file of migrations.filter(name => name > boundaryMigration && name < orgAdminMigration)) {
    await db.exec(readFileSync(resolve("supabase/migrations", file), "utf8"));
  }
  // Reproduce the explicit API grants observed on these legacy functions in
  // production. REVOKE FROM PUBLIC alone does not remove direct role grants.
  await db.exec(`grant execute on function public.can_see(uuid,uuid,text),
    public.enqueue_decision_embedding(),public.guard_active_item_source()
    to anon,authenticated,service_role`);
  // Supabase grants newly created public functions to API roles by default.
  // Reproduce that before 0026 so its explicit four-role REVOKEs are tested.
  await db.exec("alter default privileges in schema public grant all on functions to anon, authenticated, service_role");
  for (const file of migrations.filter(name => name >= orgAdminMigration)) {
    await db.exec(readFileSync(resolve("supabase/migrations", file), "utf8"));
    if (file === "0028_trailer_assessment.sql") {
      // Legacy rollback contracts belong to their own migration boundary.
      // Later migrations (0036) intentionally add private-schema dependencies.
      // Roll back this test transaction so the full latest-schema checks still run.
      await db.exec("begin");
      try {
        await q("insert into auth.users(id) values ($1)", [adminIds.adminA]);
        await q("insert into org_admins(org_id,user_id,granted_by) values ($1,$2,'rollback-fixture')", [backfillIds.org, adminIds.adminA]);
        await db.exec(readFileSync(resolve("supabase/rollback/0028_trailer_assessment_down.sql"), "utf8"));
        await check("0028 rollback removes assessment only at its migration boundary", async () => { assert.equal((await q("select to_regclass('public.trailer_attempts') value")).rows[0].value, null); });
        await db.exec(readFileSync(resolve("supabase/rollback/0027_trailer_publish_down.sql"), "utf8"));
        await check("0027 rollback restores the exact 0026 overview contract", () => asUser(adminIds.adminA, async () => {
          assert.deepEqual(Object.keys((await q("select admin_overview() result")).rows[0].result).sort(), ["departments", "llm_calls_this_month", "org_name"]);
        }));
        await db.exec(readFileSync(resolve("supabase/rollback/0026_org_admin_down.sql"), "utf8"));
        await check("0026 manual rollback removes the complete organization admin surface at its migration boundary", async () => {
          for (const name of ["org_admins", "member_invites", "admin_events"])
            assert.equal((await q("select to_regclass($1) as value", [`public.${name}`])).rows[0].value, null);
          assert.equal((await q("select count(*)::int as count from information_schema.schemata where schema_name='private'")).rows[0].count, 0);
        });
      } finally { await db.exec("rollback"); }
    }
  }
  await check("visibility helper rejects anonymous execution even with legacy direct grants", async () => {
    assert.equal((await q("select has_function_privilege('anon','public.can_see(uuid,uuid,text)','execute') allowed")).rows[0].allowed, false);
    await db.exec("set role anon");
    try { await denied("select public.can_see($1,$2,'dept')", [ids.lead, ids.dept]); }
    finally { await db.exec("reset role"); }
    for (const role of ["authenticated", "service_role"])
      assert.equal((await q("select has_function_privilege($1,'public.can_see(uuid,uuid,text)','execute') allowed", [role])).rows[0].allowed, true);
  });
  await check("internal trigger functions have no direct API execution grants", async () => {
    for (const name of ["public.enqueue_decision_embedding()", "public.guard_active_item_source()"])
      for (const role of ["anon", "authenticated", "service_role"])
        assert.equal((await q("select has_function_privilege($1,$2,'execute') allowed", [role, name])).rows[0].allowed, false, `${role} ${name}`);
  });
  await check("0017 backfills card and direct decision visibility from their evidence", async () => {
    const rows = await q("select id,visibility from decisions where id in ($1,$2) order by id", [backfillIds.cardDecision,backfillIds.directDecision]);
    assert.equal(rows.rows.length, 2);
    assert.equal(rows.rows.every(row => row.visibility === "leads_only"), true);
  });
  await q("insert into auth.users values ($1),($2)", [ids.lead, ids.member]);
  await q("insert into orgs(id,name) values ($1,'SQL fixture')", [ids.org]);
  await q("insert into departments(id,org_id,name) values ($1,$2,'SQL fixture')", [ids.dept,ids.org]);
  await q("insert into members(user_id,dept_id,role,display_name,consented_at) values ($1,$3,'lead','lead',now()),($2,$3,'member','member',now())", [ids.lead,ids.member,ids.dept]);
  await q("update members set slack_user_id=case when user_id=$1 then 'U_CONSENT_LEAD' else 'U_CONSENT_MEMBER' end, consented_at=case when user_id=$1 then consented_at else null end, consent_version=null where dept_id=$2", [ids.lead, ids.dept]);
  await check("authenticated cannot invoke Slack consent RPC", () => asUser(ids.member, () => denied("select consent_via_slack('U_CONSENT_MEMBER',$1)", [ids.dept])));
  await check("Slack consent updates only the clicked user's matching department membership", async () => {
    const leadBefore = (await q("select consented_at from members where user_id=$1 and dept_id=$2", [ids.lead, ids.dept])).rows[0].consented_at;
    await db.exec("set role service_role");
    try {
      assert.equal((await q("select consent_via_slack('U_CONSENT_MEMBER',$1) as consented", [ids.dept])).rows[0].consented, true);
      assert.equal((await q("select consent_via_slack('U_CONSENT_MEMBER',$1) as consented", [randomUUID()])).rows[0].consented, false);
    } finally { await db.exec("reset role"); }
    const member = (await q("select consented_at is not null as consented, consent_version from members where user_id=$1 and dept_id=$2", [ids.member, ids.dept])).rows[0];
    const leadAfter = (await q("select consented_at from members where user_id=$1 and dept_id=$2", [ids.lead, ids.dept])).rows[0].consented_at;
    assert.deepEqual(member, { consented: true, consent_version: 1 });
    assert.deepEqual(leadAfter, leadBefore);
  });
  await q("insert into auth.users values ($1)", [ids.memberB]);
  await q("insert into members(user_id,dept_id,role,display_name,consented_at) values ($1,$2,'member','member B',now())", [ids.memberB,ids.dept]);
  await q("insert into sources(id,dept_id,kind,external_id,visibility) values ($1,$3,'slack_channel','public','dept'),($2,$3,'slack_channel','private','leads_only')", [ids.publicSource,ids.privateSource,ids.dept]);
  const embedding = JSON.stringify(Array(1024).fill(0.01));
  await q("insert into items(id,source_id,dept_id,content,embedding,embed_model) values ($1,$3,$5,'public evidence',$6,'voyage-4-lite'),($2,$4,$5,'private evidence',$6,'voyage-4-lite')", [ids.publicItem,ids.privateItem,ids.publicSource,ids.privateSource,ids.dept,embedding]);
  await q("insert into decision_requests(id,dept_id,title,background,visibility,assignee_id) values ($1,$3,'private card','private background','leads_only',$4),($2,$3,'public card','public background','dept',$4)", [ids.card,ids.publicCard,ids.dept,ids.lead]);
  await q("insert into decision_requests(id,dept_id,title,background,visibility,assignee_id,status) values ($1,$2,'deferred card','deferred background','dept',$3,'deferred')", [ids.deferredCard,ids.dept,ids.member]);
  await q("insert into decision_requests(id,dept_id,title,background,visibility,assignee_id) values ($1,$2,'slack card','slack background','dept',$3)", [ids.slackCard,ids.dept,ids.member]);
  await q("insert into decisions(id,dept_id,request_id,decided_by,decided_by_name,outcome,rationale,visibility) values ($1,$2,$3,$4,'lead','private outcome','private rationale','leads_only')", [ids.decision,ids.dept,ids.card,ids.lead]);
  await q("insert into decisions(id,dept_id,decided_by,decided_by_name,outcome,rationale,visibility) values ($1,$2,$3,'lead','public outcome','public rationale','dept')", [ids.publicDecision,ids.dept,ids.lead]);
  const supersededDecision = randomUUID();
  const currentDecision = randomUUID();
  await q("insert into decisions(id,dept_id,decided_by,decided_by_name,outcome,rationale,visibility,embedding,embed_model) values ($1,$2,$3,'lead','old similar','old rationale','dept',$4,'voyage-4-lite'),($5,$2,$3,'lead','current similar','current rationale','dept',$4,'voyage-4-lite')", [supersededDecision,ids.dept,ids.lead,embedding,currentDecision]);
  await q("update decisions set supersedes_id=$1 where id=$2", [supersededDecision,currentDecision]);
  await q("insert into meetings(id,source_id,dept_id,status) values ($1,$2,$3,'transcribed')", [ids.meeting,ids.publicSource,ids.dept]);
  await q("insert into conflicts(id,request_id,prior_decision_id,explanation) values ($1,$2,$3,'synthetic conflict')", [ids.conflict,ids.publicCard,ids.publicDecision]);
  for (const [key,status] of [["answer","done"],["pending","pending"],["failed","failed"]]) {
    await q("insert into answers(id,dept_id,asked_by,question,status) values ($1,$2,$3,'synthetic question',$4)", [ids[key],ids.dept,ids.lead,status]);
  }
  await q("insert into answers(id,dept_id,asked_by,question,status) values ($1,$3,$4,'member A question','done'),($2,$3,$5,'member B question','done')", [ids.memberAnswer,ids.memberBAnswer,ids.dept,ids.member,ids.memberB]);
  await q("insert into citations(owner_kind,owner_id,item_id,quote) values ('answer',$1,$3,'public evidence'),('answer',$2,$3,'public evidence')", [ids.memberAnswer,ids.memberBAnswer,ids.publicItem]);
  // Production complete_answer marks cited answers verified; the read boundary
  // intentionally hides incomplete synthetic 'done' rows as of 0029.
  await q("update answers set verified=true where id in ($1,$2)",[ids.memberAnswer,ids.memberBAnswer]);
  await q("insert into sources(id,dept_id,kind,external_id,visibility) values ($1,$2,'slack_channel','removal-source','dept')", [removalIds.source, ids.dept]);
  await q("insert into items(id,source_id,dept_id,content,embedding,embed_model) values ($1,$2,$3,'removal evidence',$4,'voyage-4-lite')", [removalIds.item, removalIds.source, ids.dept, embedding]);
  await q("insert into classifications(item_id,label,method) values ($1,'decision','llm')", [removalIds.item]);
  await q("insert into decision_requests(id,dept_id,title,background,visibility) values ($1,$2,'removal card','removal card','dept')", [removalIds.request, ids.dept]);
  await q("insert into citations(owner_kind,owner_id,item_id,quote) values ('decision_request',$1,$2,'removal evidence')", [removalIds.request, removalIds.item]);
  await q("insert into orgs(id,name,is_demo) values ($1,'demo removal',true)", [removalIds.demoOrg]);
  await q("insert into departments(id,org_id,name) values ($1,$2,'demo removal')", [removalIds.demoDept, removalIds.demoOrg]);
  await q("insert into members(user_id,dept_id,role,display_name,consented_at) values ($1,$2,'lead','demo lead',now())", [ids.lead, removalIds.demoDept]);
  await q("insert into sources(id,dept_id,kind,external_id) values ($1,$2,'slack_channel','demo-removal-source')", [removalIds.demoSource, removalIds.demoDept]);
  const roleCriteria = JSON.stringify([{ key: "evidence", label: "근거", description: "문서 근거", weight: 1 }]);
  for (const actor of [ids.member, ids.lead]) {
    await check("0025 rejects department reassignment, creation, and deletion", () => asUser(actor, async () => {
      await denied("update departments set org_id=$1 where id=$2", [removalIds.demoOrg, ids.dept]);
      await denied("insert into departments(org_id,name) values($1,'forged')", [ids.org]);
      await denied("delete from departments where id=$1", [ids.dept]);
      assert.equal((await q("select id from departments where id=$1", [ids.dept])).rows.length, 1);
    }));
    await check("0025 rejects raw items insertion on public and private sources", () => asUser(actor, async () => {
      for (const source of [ids.publicSource, ids.privateSource]) {
        await denied("insert into items(source_id,dept_id,content) values($1,$2,'synthetic unmasked input')", [source, ids.dept]);
      }
    }));
  }
  await check("0025 preserves service ingestion and guest read-only isolation", async () => {
    const item = randomUUID();
    await db.exec("set role service_role");
    try {
      await q("insert into items(id,source_id,dept_id,content) values($1,$2,$3,'synthetic masked input')", [item, ids.publicSource, ids.dept]);
    } finally { await db.exec("reset role"); }
    await asUser(ids.member, async () => {
      assert.equal((await q("select id from items where id=$1", [item])).rows.length, 1);
      assert.equal((await q("select id from items where id=$1", [ids.privateItem])).rows.length, 0);
    });
    await db.exec("set role anon");
    try {
      assert.equal((await q("select id from departments where id=$1", [ids.dept])).rows.length, 0);
      assert.equal((await q("select id from departments where id=$1", [removalIds.demoDept])).rows.length, 1);
      assert.equal((await q("select id from items where id=$1", [item])).rows.length, 0);
      await denied("update departments set org_id=$1 where id=$2", [ids.org, removalIds.demoDept]);
      await denied("insert into items(source_id,dept_id,content) values($1,$2,'synthetic')", [removalIds.demoSource, removalIds.demoDept]);
    } finally { await db.exec("reset role"); }
  });
  await check("all public tables: authenticated/anon direct-write policy and grant matrix", async () => {
    // Snapshot existing intentional API write surfaces; this is not a claim
    // that every allowed column/value is safe (row tests cover those separately).
    const allowed = {
      INSERT: ["agent_roles", "answers", "document_summaries", "meetings", "sources"],
      UPDATE: ["agent_roles", "document_summaries", "members", "sources"],
      DELETE: ["document_summaries", "sources"],
    };
    const tables = (await q("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
    for (const role of ["authenticated", "anon"]) {
      for (const command of ["INSERT", "UPDATE", "DELETE"]) {
        assert.equal((await q("select has_table_privilege($1,'public.device_links',$2) allowed", [role,command])).rows[0].allowed,false);
      }
    }
    assert.ok(tables.length >= 18);
    for (const role of ["authenticated", "anon"]) {
      for (const command of ["INSERT", "UPDATE", "DELETE"]) {
        const actual = [];
        for (const { tablename } of tables) {
          const result = await q(`select
            (has_table_privilege($1, 'public.' || $2, $3)
              or ($3 in ('INSERT','UPDATE') and has_any_column_privilege($1, 'public.' || $2, case when $3='INSERT' then 'INSERT' else 'UPDATE' end)))
            and exists(select 1 from pg_policies where schemaname='public' and tablename=$2
              and permissive='PERMISSIVE' and cmd in ('ALL',$3)
              and (roles @> array[$1]::name[] or roles @> array['public']::name[])) as writable`, [role, tablename, command]);
          if (result.rows[0].writable) actual.push(tablename);
        }
        assert.deepEqual(actual, role === "authenticated" ? allowed[command] : [], `${role} ${command}`);
      }
    }
    const columns = (await q("select column_name from information_schema.column_privileges where table_schema='public' and table_name='members' and grantee='authenticated' and privilege_type='UPDATE' order by column_name")).rows;
    assert.deepEqual(columns.map(row => row.column_name), ["consent_version", "consented_at", "slack_user_id"]);
  });
  await q("insert into orgs(id,name) values ($1,'role other org')", [roleIds.otherOrg]);
  await q("insert into departments(id,org_id,name) values ($1,$2,'role other dept')", [roleIds.otherDept, roleIds.otherOrg]);
  await q("insert into sources(id,dept_id,kind,external_id,visibility) values ($1,$5,'document','role-public','dept'),($2,$5,'document','role-private','leads_only'),($3,$5,'slack_channel','role-not-document','dept'),($4,$6,'document','role-other-dept','dept')", [roleIds.publicDocument, roleIds.privateDocument, roleIds.nonDocumentSource, roleIds.otherDocument, ids.dept, roleIds.otherDept]);
  await q("insert into document_summaries(source_id,dept_id) values ($1,$5),($2,$5),($3,$5),($4,$6)", [roleIds.publicDocument, roleIds.privateDocument, roleIds.nonDocumentSource, roleIds.otherDocument, ids.dept, roleIds.otherDept]);
  await q("insert into agent_roles(id,dept_id,name,instruction,criteria,visibility,created_by) values ($1,$2,'demo role','demo instruction',$3::jsonb,'leads_only',$4)", [roleIds.demoRole, removalIds.demoDept, roleCriteria, ids.lead]);
  await check("member cannot insert agent roles", () => asUser(ids.member, () => denied(
    "insert into agent_roles(dept_id,name,instruction,criteria,visibility,created_by) values($1,'forged','forged',$2::jsonb,'dept',$3)",
    [ids.dept, roleCriteria, ids.member],
  )));
  await check("lead cannot forge an agent role creator", () => asUser(ids.lead, () => denied(
    "insert into agent_roles(dept_id,name,instruction,criteria,visibility,created_by) values($1,'forged creator','forged',$2::jsonb,'dept',$3)",
    [ids.dept, roleCriteria, ids.member],
  )));
  await check("lead can insert valid agent roles", () => asUser(ids.lead, async () => {
    const inserted = await q("insert into agent_roles(id,dept_id,name,instruction,criteria,visibility,created_by) values($1,$4,'department role','department instruction',$6::jsonb,'dept',$5),($2,$4,'private role','private instruction',$6::jsonb,'leads_only',$5),($3,$4,'archivable role','archive instruction',$6::jsonb,'leads_only',$5) returning id", [roleIds.deptRole, roleIds.privateRole, roleIds.archivedRole, ids.dept, ids.lead, roleCriteria]);
    assert.equal(inserted.rows.length, 3);
  }));
  await check("agent role visibility hides leads-only roles from members", () => asUser(ids.member, async () => {
    assert.equal((await q("select id from agent_roles where id=$1", [roleIds.privateRole])).rows.length, 0);
    assert.equal((await q("select id from agent_roles where id=$1", [roleIds.deptRole])).rows.length, 1);
  }));
  await check("agent roles only allow one-way archival updates", () => asUser(ids.lead, async () => {
    await assert.rejects(
      () => q("update agent_roles set name='rewritten' where id=$1", [roleIds.archivedRole]),
      error => error.code === "42501" && error.message === "agent_role_update_forbidden",
    );
    assert.equal((await q("update agent_roles set archived_at=clock_timestamp() where id=$1 returning id", [roleIds.archivedRole])).rows.length, 1);
  }));
  await check("members cannot request agent role runs", () => asUser(ids.member, async () => {
    await assert.rejects(
      () => q("select * from request_agent_role_run($1,$2::uuid[])", [roleIds.deptRole, uuidArray([roleIds.publicDocument])]),
      error => error.code === "42501" && error.message === "agent_role_forbidden",
    );
  }));
  await check("agent role runs reject cross-department, non-document, and oversized source sets", () => asUser(ids.lead, async () => {
    for (const sources of [[roleIds.otherDocument], [roleIds.nonDocumentSource], oversizedRoleSources]) {
      await assert.rejects(
        () => q("select * from request_agent_role_run($1,$2::uuid[])", [roleIds.deptRole, uuidArray(sources)]),
        error => error.code === "22023" && error.message === "agent_role_sources_invalid",
      );
    }
  }));
  let publicRoleResult;
  let privateRoleResult;
  await check("agent role runs upsert results with narrowest visibility and fresh timestamps", () => asUser(ids.lead, async () => {
    const sources = uuidArray([roleIds.publicDocument, roleIds.privateDocument]);
    const first = await q("select * from request_agent_role_run($1,$2::uuid[])", [roleIds.deptRole, sources]);
    assert.equal(first.rows.length, 2);
    const firstUpdatedAt = new Map(first.rows.map(row => [row.source_id, new Date(row.updated_at).getTime()]));
    const stored = await q("select id,source_id,visibility from agent_role_results where role_id=$1 order by source_id", [roleIds.deptRole]);
    assert.equal(stored.rows.length, 2);
    publicRoleResult = stored.rows.find(row => row.source_id === roleIds.publicDocument)?.id;
    privateRoleResult = stored.rows.find(row => row.source_id === roleIds.privateDocument)?.id;
    assert.equal(stored.rows.find(row => row.source_id === roleIds.publicDocument)?.visibility, "dept");
    assert.equal(stored.rows.find(row => row.source_id === roleIds.privateDocument)?.visibility, "leads_only");

    const second = await q("select * from request_agent_role_run($1,$2::uuid[])", [roleIds.deptRole, sources]);
    assert.equal(second.rows.length, 2);
    assert.equal((await q("select id from agent_role_results where role_id=$1", [roleIds.deptRole])).rows.length, 2);
    for (const row of second.rows) {
      assert.ok(new Date(row.updated_at).getTime() > firstUpdatedAt.get(row.source_id));
    }
  }));
  await check("members cannot write agent role results or read leads-only results", () => asUser(ids.member, async () => {
    await denied(
      "insert into agent_role_results(role_id,source_id,dept_id,visibility,requested_by) values($1,$2,$3,'leads_only',$4)",
      [roleIds.privateRole, roleIds.publicDocument, ids.dept, ids.member],
    );
    await denied("update agent_role_results set status='completed' where id=$1", [publicRoleResult]);
    assert.equal((await q("select id from agent_role_results where id=$1", [privateRoleResult])).rows.length, 0);
  }));
  await check("archived roles cannot be run", () => asUser(ids.lead, async () => {
    await assert.rejects(
      () => q("select * from request_agent_role_run($1,$2::uuid[])", [roleIds.archivedRole, uuidArray([roleIds.publicDocument])]),
      error => error.code === "42501" && error.message === "agent_role_forbidden",
    );
  }));
  await check("demo department roles cannot be run", () => asUser(ids.lead, async () => {
    await assert.rejects(
      () => q("select * from request_agent_role_run($1,$2::uuid[])", [roleIds.demoRole, uuidArray([roleIds.publicDocument])]),
      error => error.code === "42501" && error.message === "agent_role_forbidden",
    );
  }));
  await check("guests read demo agent roles and results only, without writes", async () => {
    const demoResult = randomUUID();
    await q("insert into agent_role_results(id,role_id,source_id,dept_id,visibility,status,requested_by) values ($1,$2,$3,$4,'dept','completed',$5)", [demoResult, roleIds.demoRole, removalIds.demoSource, removalIds.demoDept, ids.lead]);
    await db.exec("set role anon");
    try {
      assert.equal((await q("select id from agent_roles where id=$1", [roleIds.demoRole])).rows.length, 1);
      assert.equal((await q("select id from agent_roles where id=$1", [roleIds.deptRole])).rows.length, 0);
      assert.equal((await q("select id from agent_role_results where id=$1", [demoResult])).rows.length, 1);
      assert.equal((await q("select id from agent_role_results where id=$1", [publicRoleResult])).rows.length, 0);
      await denied("insert into agent_roles(dept_id,name,instruction,criteria,visibility,created_by) values($1,'anon','anon',$2::jsonb,'dept',$3)", [removalIds.demoDept, roleCriteria, ids.lead]);
      await denied("update agent_role_results set weighted_score=5 where id=$1", [demoResult]);
    } finally { await db.exec("reset role"); }
  });
  await check("removing a document source deletes its agent role results", async () => {
    assert.ok((await q("select id from agent_role_results where source_id=$1", [roleIds.privateDocument])).rows.length > 0);
    await asUser(ids.lead, () => q("select remove_source($1)", [roleIds.privateDocument]));
    assert.equal((await q("select id from agent_role_results where source_id=$1", [roleIds.privateDocument])).rows.length, 0);
    assert.equal((await q("select id from agent_role_results where source_id=$1", [roleIds.publicDocument])).rows.length, 1);
  });
  await check("member cannot remove a source and demo sources are never removable", async () => {
    await asUser(ids.member, () => denied("select remove_source($1)", [removalIds.source]));
    await asUser(ids.lead, () => denied("select remove_source($1)", [removalIds.demoSource]));
  });
  await check("lead source removal erases searchable evidence but preserves ledger quotes", async () => {
    await asUser(ids.lead, async () => {
      const result = (await q("select remove_source($1) as result", [removalIds.source])).rows[0].result;
      assert.deepEqual(result, { removed_items: 1 });
    });
    const item = (await q("select content, embedding, embed_status, deleted_at is not null as deleted from items where id=$1", [removalIds.item])).rows[0];
    assert.deepEqual(item, { content: "", embedding: null, embed_status: "deleted", deleted: true });
    assert.equal((await q("select item_id from classifications where item_id=$1", [removalIds.item])).rows.length, 0);
    assert.equal((await q("select quote from citations where owner_id=$1", [removalIds.request])).rows[0].quote, "removal evidence");
    await asUser(ids.lead, async () => {
      assert.equal((await q("select * from search_as($1,$2,$3,8) where id=$4", [ids.lead, ids.dept, embedding, removalIds.item])).rows.length, 0);
    });
  });
  await check("removed item remains updateable for worker cleanup", async () => {
    await db.exec("set role service_role");
    try {
      assert.equal((await q("update items set embed_status='deleted' where id=$1 returning id", [removalIds.item])).rows.length, 1);
    } finally { await db.exec("reset role"); }
  });
  await check("inactive source rejects direct item inserts", async () => {
    await db.exec("set role service_role");
    try {
      await assert.rejects(
        () => q("insert into items(source_id,dept_id,external_ref,content) values($1,$2,'removed.direct','masked body')", [removalIds.source,ids.dept]),
        error => error.code === "23514" && error.message === "inactive_source",
      );
    } finally { await db.exec("reset role"); }
  });
  await check("inactive source rejects Slack ingestion before an item can persist", async () => {
    await q("update members set slack_user_id='U_REMOVED_SOURCE' where user_id=$1 and dept_id=$2", [ids.lead, ids.dept]);
    await db.exec("set role service_role");
    try {
      const result = await q("select ingest_slack_atomic('removed-source-event',$1,'U_REMOVED_SOURCE','item','masked body','removed.1',null,null) as saved", [removalIds.source]);
      assert.equal(result.rows[0].saved.status, 'skipped');
    } finally { await db.exec("reset role"); }
    assert.equal((await q("select id from items where source_id=$1 and external_ref='removed.1'", [removalIds.source])).rows.length, 0);
  });
  const mergeQuery = cosineVector(1);
  await check("find_merge_candidates includes the 72h/0.55 boundaries and rejects stale, closed, or sub-threshold cards", async () => {
    await db.exec("begin");
    try {
      await q("insert into departments(id,org_id,name) values ($1,$4,'merge-boundary'),($2,$4,'merge-visibility'),($3,$4,'merge-limit')", [mergeIds.boundaryDept,mergeIds.visibilityDept,mergeIds.limitDept,ids.org]);
      await q("insert into sources(id,dept_id,kind,external_id,visibility) values ($1,$4,'document','merge-boundary','dept'),($2,$5,'document','merge-visibility','dept'),($3,$6,'document','merge-limit','dept')", [mergeIds.boundarySource,mergeIds.visibilitySource,mergeIds.limitSource,mergeIds.boundaryDept,mergeIds.visibilityDept,mergeIds.limitDept]);
      await q("insert into items(id,source_id,dept_id,content,embedding,embed_model) values ($1,$5,$6,'exact boundary',$9,'voyage-4-lite'),($2,$5,$6,'below threshold',$10,'voyage-4-lite'),($3,$5,$6,'stale candidate',$11,'voyage-4-lite'),($4,$5,$6,'closed candidate',$11,'voyage-4-lite'),($7,$8,$12,'dept candidate',$11,'voyage-4-lite'),($13,$8,$12,'lead candidate',$14,'voyage-4-lite')", [mergeIds.exactItem,mergeIds.belowItem,mergeIds.oldItem,mergeIds.closedItem,mergeIds.boundarySource,mergeIds.boundaryDept,mergeIds.deptItem,mergeIds.visibilitySource,cosineVector(0.55),cosineVector(0.549),mergeQuery,mergeIds.visibilityDept,mergeIds.leadItem,cosineVector(0.9)]);
      await q("insert into decision_requests(id,dept_id,title,background,visibility,status,opened_at) values ($1,$7,'exact','exact','dept','open',now()-interval '72 hours'),($2,$7,'below','below','dept','open',now()-interval '1 hour'),($3,$7,'old','old','dept','open',now()-interval '72 hours 1 second'),($4,$7,'closed','closed','dept','decided',now()-interval '1 hour'),($5,$8,'dept','dept','dept','open',now()-interval '1 hour'),($6,$8,'lead','lead','leads_only','open',now()-interval '1 hour')", [mergeIds.exactCard,mergeIds.belowCard,mergeIds.oldCard,mergeIds.closedCard,mergeIds.deptCard,mergeIds.leadCard,mergeIds.boundaryDept,mergeIds.visibilityDept]);
      await q("insert into citations(owner_kind,owner_id,item_id,quote) values ('decision_request',$1,$7,'exact boundary'),('decision_request',$2,$8,'below threshold'),('decision_request',$3,$9,'stale candidate'),('decision_request',$4,$10,'closed candidate'),('decision_request',$5,$11,'dept candidate'),('decision_request',$6,$12,'lead candidate')", [mergeIds.exactCard,mergeIds.belowCard,mergeIds.oldCard,mergeIds.closedCard,mergeIds.deptCard,mergeIds.leadCard,mergeIds.exactItem,mergeIds.belowItem,mergeIds.oldItem,mergeIds.closedItem,mergeIds.deptItem,mergeIds.leadItem]);
      await q("insert into items(id,source_id,dept_id,content,embedding,embed_model) values ($1,$5,$6,'limit 1',$7,'voyage-4-lite'),($2,$5,$6,'limit 2',$8,'voyage-4-lite'),($3,$5,$6,'limit 3',$9,'voyage-4-lite'),($4,$5,$6,'limit 4',$10,'voyage-4-lite')", [mergeIds.limitItem1,mergeIds.limitItem2,mergeIds.limitItem3,mergeIds.limitItem4,mergeIds.limitSource,mergeIds.limitDept,cosineVector(0.99),cosineVector(0.98),cosineVector(0.97),cosineVector(0.96)]);
      await q("insert into decision_requests(id,dept_id,title,background,visibility,status,opened_at) values ($1,$5,'limit 1','limit 1','dept','open',now()-interval '1 hour'),($2,$5,'limit 2','limit 2','dept','open',now()-interval '1 hour'),($3,$5,'limit 3','limit 3','dept','open',now()-interval '1 hour'),($4,$5,'limit 4','limit 4','dept','open',now()-interval '1 hour')", [mergeIds.limitCard1,mergeIds.limitCard2,mergeIds.limitCard3,mergeIds.limitCard4,mergeIds.limitDept]);
      await q("insert into citations(owner_kind,owner_id,item_id,quote) values ('decision_request',$1,$5,'limit 1'),('decision_request',$2,$6,'limit 2'),('decision_request',$3,$7,'limit 3'),('decision_request',$4,$8,'limit 4')", [mergeIds.limitCard1,mergeIds.limitCard2,mergeIds.limitCard3,mergeIds.limitCard4,mergeIds.limitItem1,mergeIds.limitItem2,mergeIds.limitItem3,mergeIds.limitItem4]);
      await db.exec("set role service_role");
      const boundary = await q("select * from find_merge_candidates($1,$2,'dept',$3,0.55::real,3)", [mergeIds.boundaryDept,mergeQuery,randomUUID()]);
      assert.equal(boundary.rows.length, 1);
      assert.equal(boundary.rows[0].request_id, mergeIds.exactCard);
      assert.ok(Math.abs(boundary.rows[0].similarity - 0.55) < 0.00001);
      assert.equal((await q("select * from find_merge_candidates($1,$2,'dept',$3,0.55::real,3)", [mergeIds.boundaryDept,mergeQuery,mergeIds.exactItem])).rows.length, 0);
      const limited = await q("select request_id,similarity from find_merge_candidates($1,$2,'dept',$3,0.55::real,99)", [mergeIds.limitDept,mergeQuery,randomUUID()]);
      assert.equal(limited.rows.length, 3);
      assert.deepEqual(limited.rows.map(row => row.request_id), [mergeIds.limitCard1,mergeIds.limitCard2,mergeIds.limitCard3]);
      await db.exec("reset role");
      await db.exec("commit");
    } catch (error) {
      await db.exec("reset role").catch(() => undefined);
      await db.exec("rollback").catch(() => undefined);
      throw error;
    }
  });
  await check("find_merge_candidates refuses visibility narrowing and remains service-role-only", async () => {
    await db.exec("set role service_role");
    try {
      const privateOrigin = await q("select * from find_merge_candidates($1,$2,'leads_only',$3,0.55::real,3)", [mergeIds.visibilityDept,mergeQuery,randomUUID()]);
      assert.equal(privateOrigin.rows[0].request_id, mergeIds.leadCard);
      const publicOrigin = await q("select * from find_merge_candidates($1,$2,'dept',$3,0.55::real,3)", [mergeIds.visibilityDept,mergeQuery,randomUUID()]);
      assert.equal(publicOrigin.rows[0].request_id, mergeIds.deptCard);
    } finally {
      await db.exec("reset role");
    }
    await asUser(ids.lead, () => denied("select * from find_merge_candidates($1,$2,'dept',$3,0.55::real,3)", [mergeIds.visibilityDept,mergeQuery,randomUUID()]));
  });
  await check("citation owner/item partial unique index rejects duplicate evidence", async () => {
    await assert.rejects(
      () => q("insert into citations(owner_kind,owner_id,item_id,quote) values ('decision_request',$1,$2,'duplicate')", [mergeIds.exactCard,mergeIds.exactItem]),
      error => error.code === "23505",
    );
  });
  // decision embedding trigger 검증은 아래에서 별도로 하고, lease fixture에는 신규 작업을 섞지 않는다.
  await q("update jobs set status='done' where kind='embed_decision'");
  const expiredLeaseJob = randomUUID();
  const activeLeaseJob = randomUUID();
  const exhaustedLeaseJob = randomUUID();
  await q("insert into jobs(id,kind,payload,status,attempts,run_after,lease_until) values ($1,'classify','{}','running',1,now()-interval '10 minutes',now()-interval '1 minute'),($2,'classify','{}','running',1,now()-interval '10 minutes',now()+interval '1 minute'),($3,'classify','{}','running',3,now()-interval '10 minutes',now()-interval '1 minute')", [expiredLeaseJob,activeLeaseJob,exhaustedLeaseJob]);
  await check("expired running lease is reclaimed with a new five-minute lease", async () => {
    await db.exec("set role service_role");
    try {
      const claimed = await q("select id, status, attempts, lease_until > now() as lease_active from claim_jobs(10)");
      assert.deepEqual(claimed.rows, [{ id: expiredLeaseJob, status: "running", attempts: 2, lease_active: true }]);
    } finally { await db.exec("reset role"); }
  });
  await check("active running lease is not claimed", async () => {
    await db.exec("set role service_role");
    try {
      assert.equal((await q("select id from claim_jobs(10)")).rows.length, 0);
      assert.equal((await q("select status from jobs where id=$1", [activeLeaseJob])).rows[0].status, "running");
    } finally { await db.exec("reset role"); }
  });
  await check("exhausted expired lease is failed without another claim", async () => {
    const row = (await q("select status, last_error, lease_until from jobs where id=$1", [exhaustedLeaseJob])).rows[0];
    assert.deepEqual(row, { status: "failed", last_error: "lease_expired", lease_until: null });
  });
  await check("authenticated cannot call claim_jobs", () => asUser(ids.lead, () => denied("select * from claim_jobs(1)")));
  await check("member cannot read lead answer or private ledger", () => asUser(ids.member, async () => {
    assert.equal((await q("select id from answers where id=$1", [ids.answer])).rows.length, 0);
    assert.equal((await q("select id from decisions where id=$1", [ids.decision])).rows.length, 0);
    assert.equal((await q("select * from recent_decisions_as($1,$2,3) where id=$3",[ids.member,ids.dept,ids.decision])).rows.length,0);
  }));
  await check("answer citations are visible only to their own questioner", async () => {
    await asUser(ids.member, async () => {
      assert.equal((await q("select id from citations where owner_id=$1", [ids.memberAnswer])).rows.length, 1);
      assert.equal((await q("select id from citations where owner_id=$1", [ids.memberBAnswer])).rows.length, 0);
    });
    await asUser(ids.memberB, async () => {
      assert.equal((await q("select id from citations where owner_id=$1", [ids.memberBAnswer])).rows.length, 1);
      assert.equal((await q("select id from citations where owner_id=$1", [ids.memberAnswer])).rows.length, 0);
    });
  });
  await check("similar decision RPC excludes superseded rows and is service-role-only", async () => {
    await db.exec("set role service_role");
    try {
      const rows = (await q("select id from similar_decisions_for_card($1,$2,3)", [ids.dept,embedding])).rows;
      assert.deepEqual(rows.map(row => row.id), [currentDecision]);
    } finally { await db.exec("reset role"); }
    await asUser(ids.lead, () => denied("select * from similar_decisions_for_card($1,$2,3)", [ids.dept,embedding]));
  });
  await check("decision insert queues an embed_decision job", async () => {
    assert.equal((await q("select id from jobs where kind='embed_decision' and payload->>'decisionId'=$1", [currentDecision])).rows.length, 1);
  });
  await check("lead user search sees private evidence; channel search does not", () => asUser(ids.lead, async () => {
    assert.equal((await q("select * from search_as($1,$2,$3,8)",[ids.lead,ids.dept,embedding])).rows.length,2);
    const channel = await q("select * from search_channel_as($1,$2,$3,8)",[ids.lead,ids.dept,embedding]);
    assert.deepEqual(channel.rows.map(row => row.id),[ids.publicItem]);
    assert.equal((await q("select * from recent_decisions_as($1,$2,3)",[ids.lead,ids.dept])).rows.length,3);
    const channelDecisions = (await q("select * from recent_channel_decisions_as($1,$2,3)",[ids.lead,ids.dept])).rows;
    assert.equal(channelDecisions.length,2);
    assert.ok(channelDecisions.every(row => row.id !== supersededDecision));
  }));
  await check("RPC caller cannot impersonate lead", () => asUser(ids.member, async () => {
    assert.equal((await q("select * from search_channel_as($1,$2,$3,8)",[ids.lead,ids.dept,embedding])).rows.length,0);
  }));
  await check("authenticated cannot call completion RPC", () => asUser(ids.lead, () => denied("select complete_answer($1,'answer',false,null,'[]')", [ids.pending])));
  await check("missing citation target rolls back every citation and status", async () => {
    const citations = [{item_id:ids.publicItem,decision_id:null,quote:"public evidence"},{item_id:randomUUID(),decision_id:null,quote:"missing"}];
    await assert.rejects(() => q("select complete_answer($1,'answer',false,null,$2)",[ids.pending,JSON.stringify(citations)]), error => error.code === "23503");
    assert.equal((await q("select status from answers where id=$1",[ids.pending])).rows[0].status,"pending");
    assert.equal((await q("select id from citations where owner_id=$1",[ids.pending])).rows.length,0);
  });
  await check("completion is atomic and repeated completion adds no citations", async () => {
    const args = [ids.pending,JSON.stringify([{item_id:ids.publicItem,decision_id:null,quote:"public evidence"}])];
    assert.equal((await q("select complete_answer($1,'answer',false,null,$2) as saved",args)).rows[0].saved,true);
    assert.equal((await q("select complete_answer($1,'answer',false,null,$2) as saved",args)).rows[0].saved,false);
    assert.equal((await q("select status from answers where id=$1",[ids.pending])).rows[0].status,"done");
    assert.equal((await q("select id from citations where owner_id=$1",[ids.pending])).rows.length,1);
  });
  await check("swept answer cannot be resurrected", async () => {
    assert.equal((await q("select complete_answer($1,'late answer',true,null,'[]') as saved",[ids.failed])).rows[0].saved,false);
  });
  await check("member cannot promote self or forge another person's consent", () => asUser(ids.member, async () => {
    await denied("update members set role='lead' where user_id=$1",[ids.member]);
    await denied("update members set consented_at=null where user_id=$1",[ids.lead]);
  }));
  await check("own consent and lead Slack mapping remain writable", async () => {
    await asUser(ids.member, async () => { assert.equal((await q("update members set consented_at=null where user_id=$1 returning user_id",[ids.member])).rows.length,1); });
    await asUser(ids.lead, async () => { assert.equal((await q("update members set slack_user_id='TEST_MEMBER' where user_id=$1 returning user_id",[ids.member])).rows.length,1); });
  });
  await check("ledger is append only for authenticated", () => asUser(ids.lead, async () => {
    await denied("insert into decisions(dept_id,decided_by,decided_by_name,outcome,rationale) values($1,$2,'forged','forged','forged')",[ids.dept,ids.lead]);
    await denied("update decisions set outcome='forged' where id=$1",[ids.decision]);
    await denied("delete from decisions where id=$1",[ids.decision]);
  }));
  await check("card, conflict, and meeting writes are command-scoped", async () => {
    await asUser(ids.member, async () => {
      await denied("insert into decision_requests(dept_id,title,background,visibility) values($1,'forged','forged','dept')", [ids.dept]);
      await denied("update decision_requests set assignee_id=$1 where id=$2", [ids.member,ids.publicCard]);
      await denied("delete from decision_requests where id=$1", [ids.publicCard]);
      await denied("insert into conflicts(request_id,prior_decision_id,explanation) values($1,$2,'forged')", [ids.publicCard,ids.publicDecision]);
      await denied("insert into meetings(source_id,dept_id,status) values($1,$2,'transcribed')", [ids.publicSource,ids.dept]);
    });
    await asUser(ids.lead, async () => {
      await denied("update conflicts set explanation='forged' where id=$1", [ids.conflict]);
      await denied("delete from conflicts where id=$1", [ids.conflict]);
      await denied("update meetings set status='summarized' where id=$1", [ids.meeting]);
      await denied("delete from meetings where id=$1", [ids.meeting]);
      assert.equal((await q("insert into meetings(source_id,dept_id,status) values($1,$2,'transcribed') returning id", [ids.publicSource,ids.dept])).rows.length, 1);
    });
  });
  await check("only assignee or lead can decide and only lead can reopen", async () => {
    await asUser(ids.member, () => denied("select decide_request($1,'decide','forged','forged')", [ids.publicCard]));
    await asUser(ids.member, () => denied("select decide_request($1,'reopen','','')", [ids.deferredCard]));
    await asUser(ids.lead, async () => {
      const reopened = (await q("select decide_request($1,'reopen','','') as result", [ids.deferredCard])).rows[0].result;
      assert.equal(reopened.status, "open");
    });
  });
  await check("promotion is visible-item-only, enqueues make_card, and reuses an open card", async () => {
    let promotionJob;
    await asUser(ids.member, async () => {
      await denied("select promote_item($1)", [ids.privateItem]);
      promotionJob = (await q("select promote_item($1) as id", [ids.publicItem])).rows[0].id;
    });
    await q("update decision_requests set origin_item_id=$1 where id=$2", [ids.publicItem,ids.publicCard]);
    await asUser(ids.member, async () => {
      assert.equal((await q("select promote_item($1) as id", [ids.publicItem])).rows[0].id, ids.publicCard);
    });
    assert.equal((await q("select id from jobs where id=$1 and kind='make_card' and payload->>'itemId'=$2", [promotionJob,ids.publicItem])).rows.length, 1);
  });
  await check("command RPC execution grants exclude anon and the Slack actor RPC excludes authenticated", async () => {
    await db.exec("set role anon");
    try {
      await denied("select promote_item($1)", [ids.publicItem]);
      await denied("select decide_request($1,'defer','','')", [ids.slackCard]);
      await denied("select record_direct_decision($1,'forged','forged','[]')", [ids.dept]);
    } finally { await db.exec("reset role"); }
    await asUser(ids.member, () => denied("select decide_request_as($1,$2,'defer','','')", [ids.member,ids.slackCard]));
  });
  await check("service-only Slack decision RPC shares the same transition rules", async () => {
    await db.exec("set role service_role");
    try {
      const result = (await q("select decide_request_as($1,$2,'defer','','') as result", [ids.member,ids.slackCard])).rows[0].result;
      assert.equal(result.status, "deferred");
    } finally { await db.exec("reset role"); }
  });
  await check("direct private evidence fixes decision visibility and stays hidden from members", async () => {
    let directDecision;
    await asUser(ids.lead, async () => {
      directDecision = (await q("select record_direct_decision($1,'private direct','private reason',$2) as id", [ids.dept,JSON.stringify([{item_id:ids.privateItem,quote:"private evidence"}])])).rows[0].id;
      assert.equal((await q("select visibility from decisions where id=$1", [directDecision])).rows[0].visibility, "leads_only");
      assert.equal((await q("select * from recent_decisions_as($1,$2,20) where id=$3", [ids.lead,ids.dept,directDecision])).rows.length, 1);
    });
    await asUser(ids.member, async () => {
      assert.equal((await q("select id from decisions where id=$1", [directDecision])).rows.length, 0);
      assert.equal((await q("select * from recent_decisions_as($1,$2,20) where id=$3", [ids.member,ids.dept,directDecision])).rows.length, 0);
    });
  });
  await check("direct decisions reject invisible evidence and mismatched quotes", async () => {
    await asUser(ids.member, () => denied("select record_direct_decision($1,'forged','forged',$2)", [ids.dept,JSON.stringify([{item_id:ids.privateItem,quote:"private evidence"}])]))
    await asUser(ids.lead, async () => {
      await assert.rejects(
        () => q("select record_direct_decision($1,'forged','forged',$2)", [ids.dept,JSON.stringify([{item_id:ids.publicItem,quote:"not in evidence"}])]),
        error => error.code === "22023",
      );
    });
  });
  await check("citation insertion failure rolls back the direct decision", async () => {
    await db.exec("create function fail_direct_citation() returns trigger language plpgsql as $$ begin if new.quote='public evidence' then raise exception 'synthetic_citation_failure'; end if; return new; end $$; create trigger fail_direct_citation before insert on citations for each row execute function fail_direct_citation();");
    await asUser(ids.lead, async () => {
      await assert.rejects(() => q("select record_direct_decision($1,'rollback outcome','rollback reason',$2)", [ids.dept,JSON.stringify([{item_id:ids.publicItem,quote:"public evidence"}])]));
    });
    assert.equal((await q("select id from decisions where outcome='rollback outcome'")).rows.length, 0);
    await db.exec("drop trigger fail_direct_citation on citations; drop function fail_direct_citation()");
  });
  await check("deciding twice returns the original decision and inserts one row", async () => {
    await asUser(ids.lead, async () => {
      const first = (await q("select decide_request($1,'decide','approved','because') as result", [ids.publicCard])).rows[0].result;
      const second = (await q("select decide_request($1,'decide','approved again','because again') as result", [ids.publicCard])).rows[0].result;
      assert.equal(first.duplicate, false);
      assert.equal(second.duplicate, true);
      assert.equal(second.decision_id, first.decision_id);
    });
    assert.equal((await q("select id from decisions where request_id=$1", [ids.publicCard])).rows.length, 1);
  });
  await check("users cannot manufacture completed AI answers", () => asUser(ids.lead, async () => {
    await denied("update answers set answer='forged' where id=$1",[ids.answer]);
    await denied("insert into answers(dept_id,asked_by,question,status,answer) values($1,$2,'forged','done','forged')",[ids.dept,ids.lead]);
  }));
  // 독립된 4개 조직 × 3개 부서. 모든 actor/대상 부서 조합을 실제 RLS와 RPC에 대입한다.
  await q("update members set slack_user_id='U_ATOMIC', consented_at=now() where user_id=$1", [ids.member]);
  const ingest = (event, kind = 'item', content = 'synthetic masked body', ext = '123.45') =>
    q("select ingest_slack_atomic($1,$2,'U_ATOMIC',$3,$4,$5,null,'123.45') as saved", [event, ids.publicSource, kind, content, ext]);
  await check("Slack event/item/job commit atomically and duplicate delivery is a no-op", async () => {
    assert.equal((await ingest('atomic-1')).rows[0].saved.status, 'saved');
    assert.equal((await ingest('atomic-1')).rows[0].saved.status, 'duplicate');
    assert.equal((await q("select id from items where source_id=$1 and external_ref='123.45'", [ids.publicSource])).rows.length, 1);
    assert.equal((await q("select id from jobs where kind='classify' and payload->>'itemId' in (select id::text from items where source_id=$1 and external_ref='123.45')", [ids.publicSource])).rows.length, 1);
  });
  await check("job failure rolls back event and item; retry succeeds", async () => {
    await db.exec("create function fail_qa_job() returns trigger language plpgsql as $$ begin raise exception 'synthetic_job_failure'; end $$; create trigger fail_qa_job before insert on jobs for each row execute function fail_qa_job();");
    await assert.rejects(() => ingest('atomic-retry', 'item', 'synthetic retry', '123.46'));
    assert.equal((await q("select event_id from ingest_events where event_id='atomic-retry'")).rows.length, 0);
    assert.equal((await q("select id from items where source_id=$1 and external_ref='123.46'", [ids.publicSource])).rows.length, 0);
    await db.exec("alter table jobs disable trigger fail_qa_job");
    assert.equal((await ingest('atomic-retry', 'item', 'synthetic retry', '123.46')).rows[0].saved.status, 'saved');
  });
  await check("Slack mention answer and job are idempotent", async () => {
    assert.equal((await ingest('atomic-ask', 'answer', 'synthetic masked question')).rows[0].saved.status, 'saved');
    assert.equal((await ingest('atomic-ask', 'answer', 'synthetic masked question')).rows[0].saved.status, 'duplicate');
    assert.equal((await q("select id from answers where question='synthetic masked question'")).rows.length, 1);
    assert.equal((await q("select id from jobs where kind='answer' and payload->'slackReply'->>'channel'='public'")).rows.length, 1);
  });
  await check("daily ASK limit allows 50, rejects 51, resets at KST midnight, and is isolated by user", async () => {
    const limitUser = randomUUID();
    const otherUser = randomUUID();
    await q("insert into auth.users values($1),($2)", [limitUser, otherUser]);
    await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$3,'member','limit user',now()),($2,$3,'member','other user',now())", [limitUser, otherUser, ids.dept]);
    for (let index = 0; index < 50; index += 1) {
      await q("insert into answers(dept_id,asked_by,question,created_at) values($1,$2,$3,now())", [ids.dept, limitUser, `daily-limit-${index}`]);
    }
    await assert.rejects(
      () => q("insert into answers(dept_id,asked_by,question) values($1,$2,'daily-limit-51')", [ids.dept, limitUser]),
      error => error.code === 'P0001' && error.message === 'ask_daily_limit',
    );
    assert.equal((await q("insert into answers(dept_id,asked_by,question) values($1,$2,'other-user') returning id", [ids.dept, otherUser])).rows.length, 1);
    const yesterdayKst = "date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' - interval '1 second'";
    await q(`update answers set created_at=${yesterdayKst} where asked_by=$1 and question like 'daily-limit-%'`, [limitUser]);
    assert.equal((await q("insert into answers(dept_id,asked_by,question) values($1,$2,'after-kst-midnight') returning id", [ids.dept, limitUser])).rows.length, 1);
  });
  await check("rate-limited Slack ASK records its event without creating an answer or job", async () => {
    const limitedSlackUser = randomUUID();
    await q("insert into auth.users values($1)", [limitedSlackUser]);
    await q("insert into members(user_id,dept_id,role,display_name,slack_user_id,consented_at) values($1,$2,'member','limited slack','U_LIMITED',now())", [limitedSlackUser, ids.dept]);
    for (let index = 0; index < 50; index += 1) {
      await q("insert into answers(dept_id,asked_by,question) values($1,$2,$3)", [ids.dept, limitedSlackUser, `slack-limit-${index}`]);
    }
    const result = await q("select ingest_slack_atomic('atomic-limit',$1,'U_LIMITED','answer','limited slack question',null,null,'123.99') as saved", [ids.publicSource]);
    assert.deepEqual(result.rows[0].saved, { status: 'rate_limited' });
    assert.equal((await q("select event_id from ingest_events where event_id='atomic-limit'")).rows.length, 1);
    assert.equal((await q("select id from answers where asked_by=$1 and question='limited slack question'", [limitedSlackUser])).rows.length, 0);
    assert.equal((await q("select id from jobs where payload->'slackReply'->>'threadTs'='123.99'")).rows.length, 0);
  });
  await check("consent rechecked inside transaction; no unconsented body persists", async () => {
    await q("update members set consented_at=null where user_id=$1", [ids.member]);
    assert.equal((await ingest('atomic-no-consent', 'item', 'synthetic unconsented', '123.47')).rows[0].saved.status, 'skipped');
    assert.equal((await q("select id from items where content='synthetic unconsented'")).rows.length, 0);
    await q("update members set consented_at=now() where user_id=$1", [ids.member]);
  });
  await check("authenticated cannot invoke Slack ingestion RPC", () => asUser(ids.member, () => denied("select ingest_slack_atomic('forged',$1,'U_ATOMIC','item','synthetic','123',null,null)", [ids.publicSource])));
  await check("users cannot rewrite captured evidence or manufacture model classifications", () => asUser(ids.member, async () => {
    await denied("update items set content='forged' where id=$1", [ids.publicItem]);
    await denied("delete from items where id=$1", [ids.publicItem]);
    await denied("insert into classifications(item_id,label,method) values($1,'decision','llm')", [ids.publicItem]);
    await denied("update classifications set label='decision' where item_id=$1", [ids.publicItem]);
    await denied("delete from classifications where item_id=$1", [ids.publicItem]);
    await denied("update citations set quote='forged' where item_id=$1", [ids.publicItem]);
    await denied("delete from citations where item_id=$1", [ids.publicItem]);
  }));
  await check("service worker can still maintain captured evidence", async () => {
    await db.exec("set role service_role");
    try {
      assert.equal((await q("update items set content=content where id=$1 returning id", [ids.publicItem])).rows.length, 1);
      await q("insert into classifications(item_id,label,method) values($1,'info','llm')", [ids.publicItem]);
    } finally { await db.exec("reset role"); }
  });
  const departments = [];
  for (let orgIndex = 0; orgIndex < 4; orgIndex++) {
    const org = randomUUID();
    await q("insert into orgs(id,name) values($1,$2)",[org,`synthetic-org-${orgIndex}`]);
    for (let deptIndex = 0; deptIndex < 3; deptIndex++) {
      const dept = { id:randomUUID(), lead:randomUUID(), member:randomUUID(), publicSource:randomUUID(), privateSource:randomUUID(), card:randomUUID(), privateItem:randomUUID() };
      departments.push(dept);
      await q("insert into auth.users values($1),($2)",[dept.lead,dept.member]);
      await q("insert into departments(id,org_id,name) values($1,$2,$3)",[dept.id,org,`synthetic-dept-${deptIndex}`]);
      await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$3,'lead','synthetic-lead',now()),($2,$3,'member','synthetic-member',now())",[dept.lead,dept.member,dept.id]);
      await q("insert into sources(id,dept_id,kind,external_id,visibility) values($1,$3,'document','public','dept'),($2,$3,'document','private','leads_only')",[dept.publicSource,dept.privateSource,dept.id]);
      for (let itemIndex=0; itemIndex<3; itemIndex++) {
        await q("insert into items(id,source_id,dept_id,content,embedding,embed_model) values($1,$3,$5,'synthetic public',$6,'voyage-4-lite'),($2,$4,$5,'synthetic private',$6,'voyage-4-lite')",[randomUUID(),itemIndex===0?dept.privateItem:randomUUID(),dept.publicSource,dept.privateSource,dept.id,embedding]);
      }
      await q("insert into decision_requests(id,dept_id,title,background,visibility,assignee_id) values($1,$2,'synthetic private','synthetic private','leads_only',$3)",[dept.card,dept.id,dept.lead]);
      await q("insert into decisions(dept_id,request_id,decided_by,decided_by_name,outcome,rationale,visibility) values($1,$2,$3,'synthetic-lead','synthetic outcome','synthetic rationale','leads_only')",[dept.id,dept.card,dept.lead]);
      await q("insert into citations(owner_kind,owner_id,item_id,quote) values('decision_request',$1,$2,'synthetic private')",[dept.card,dept.privateItem]);
      await q("insert into answers(dept_id,asked_by,question) values($1,$2,'synthetic question'),($1,$3,'synthetic question')",[dept.id,dept.lead,dept.member]);
    }
  }
  let matrixAssertions = 0;
  await check("4 organizations / 12 departments / 24 actors: complete read and search matrix", async () => {
    for (const own of departments) {
      for (const role of ["lead","member"]) {
        await asUser(own[role], async () => {
          for (const target of departments) {
            const same = own.id === target.id;
            const visible = same ? (role === "lead" ? 6 : 3) : 0;
            const privateVisible = same && role === "lead" ? 1 : 0;
            assert.equal((await q("select id from items where dept_id=$1",[target.id])).rows.length,visible);
            assert.equal((await q("select id from decision_requests where dept_id=$1",[target.id])).rows.length,privateVisible);
            assert.equal((await q("select id from decisions where dept_id=$1",[target.id])).rows.length,privateVisible);
            assert.equal((await q("select id from citations where owner_id=$1",[target.card])).rows.length,privateVisible);
            assert.equal((await q("select id from answers where dept_id=$1",[target.id])).rows.length,same?1:0);
            assert.equal((await q("select * from search_as($1,$2,$3,50)",[own[role],target.id,embedding])).rows.length,visible);
            assert.equal((await q("select * from search_channel_as($1,$2,$3,50)",[own[role],target.id,embedding])).rows.length,same?3:0);
            matrixAssertions += 7;
          }
        });
      }
    }
  });
  await q("update auth.users set email=case id when $1 then 'lead-a@example.test' when $2 then 'member-a@example.test' when $3 then 'member-b@example.test' end where id in ($1,$2,$3)", [ids.lead, ids.member, ids.memberB]);
  await q("insert into auth.users(id,email) values($1,'admin-a@example.test'),($2,'admin-b@example.test'),($3,'lead-y@example.test'),($4,'member-org-b@example.test'),($5,'invitee@example.test'),($6,'other-invitee@example.test')", [adminIds.adminA, adminIds.adminB, adminIds.leadY, adminIds.memberB, adminIds.invitee, adminIds.otherInvitee]);
  await q("insert into orgs(id,name) values($1,'Admin fixture B')", [adminIds.orgB]);
  await q("insert into departments(id,org_id,name) values($1,$2,'Admin Y'),($3,$4,'Admin B')", [adminIds.deptY, ids.org, adminIds.deptB, adminIds.orgB]);
  await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$2,'lead','lead Y',null),($3,$4,'member','member org B',now())", [adminIds.leadY, adminIds.deptY, adminIds.memberB, adminIds.deptB]);
  await q("insert into org_admins(org_id,user_id,granted_by) values($1,$2,'script:test'),($3,$4,'script:test'),($1,$5,'script:test')", [ids.org, adminIds.adminA, adminIds.orgB, adminIds.adminB, ids.lead]);
  await q("insert into sources(id,dept_id,kind,external_id,title,visibility,last_synced_at) values($1,$2,'document','admin-y','Admin source Y','dept',now())", [adminIds.sourceY, adminIds.deptY]);
  await q("insert into items(id,source_id,dept_id,content) values($1,$2,$3,'admin Y secret content')", [adminIds.itemY, adminIds.sourceY, adminIds.deptY]);
  await q("insert into answers(id,dept_id,asked_by,question,status) values($1,$2,$3,'admin Y secret question','done')", [adminIds.answerY, adminIds.deptY, adminIds.leadY]);
  await q("insert into citations(owner_kind,owner_id,item_id,quote) values('answer',$1,$2,'admin Y secret content')", [adminIds.answerY, adminIds.itemY]);
  await q("insert into decision_requests(id,dept_id,title,background,visibility) values($1,$2,'admin Y secret card','admin Y secret background','dept')", [adminIds.cardY, adminIds.deptY]);
  await q("insert into member_invites(id,org_id,dept_id,invited_by_role,email_normalized,role,token_hash,expires_at,created_by) values($1,$2,$3,'org_admin','invitee@example.test','lead','pending-hash',now()+interval '7 days',$4)", [adminIds.pendingInvite, ids.org, adminIds.deptY, adminIds.adminA]);
  await q("insert into member_invites(id,org_id,dept_id,invited_by_role,email_normalized,role,token_hash,expires_at,created_by) values($1,$2,$3,'org_admin','cross@example.test','lead','cross-hash',now()+interval '7 days',$4)", [adminIds.crossBInvite, adminIds.orgB, adminIds.deptB, adminIds.adminB]);
  await q("insert into admin_events(org_id,actor_id,action,target) values($1,$2,'department_create',jsonb_build_object('dept_id',$3::text))", [ids.org, adminIds.adminA, adminIds.deptY]);
  await q("insert into llm_calls(dept_id,purpose,model) values($1,'test','synthetic')", [adminIds.deptY]);

  await check("organization admin private helpers are unreachable to API roles", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try { await denied("select private._admin_overview($1)", [ids.org]); }
      finally { await db.exec("reset role"); }
    }
  });
  await check("organization admin functions have exact execution grants", async () => {
    const privateFunctions = [
      "private.current_session_id()",
      "private.is_org_admin(uuid,uuid)", "private._admin_overview(uuid)",
      "private._admin_members(uuid)", "private._admin_sources(uuid)",
      "private._admin_answer_stats(uuid,date,date)",
    ];
    const authenticatedFunctions = [
      "public.link_device(uuid,text,text)", "public.companion_context()", "public.revoke_device_link(uuid)",
      "public.admin_org_id()", "public.admin_overview()", "public.admin_members()",
      "public.admin_sources()", "public.admin_answer_stats(date,date)",
      "public.admin_invites()", "public.admin_events_list(integer)",
    ];
    const anonFunctions = [
      "public.demo_admin_overview()", "public.demo_admin_members()",
      "public.demo_admin_sources()", "public.demo_admin_answer_stats(date,date)",
    ];
    const invitePrivateFunctions = [
      "private.guard_trailer_invite()", "private.trailer_invite_gate(uuid)",
      "private.trailer_invite_lookup(text,text)", "private.purge_trailer_invite(uuid,text)",
      "private.count_trailer_submission(uuid)",
    ];
    const inviteLeadFunctions = [
      "public.create_trailer_invites(uuid,text[])", "public.revoke_trailer_invite(uuid)",
      "public.delete_trailer_invite(uuid)", "public.list_trailer_invites(uuid)",
      "public.requeue_trailer_attempt_score(uuid)",
    ];
    const inviteCandidateFunctions = [
      "public.trailer_invite_open(text,text)", "public.trailer_invite_consent(text,text,text)",
      "public.submit_trailer_invite_attempt(text,text,jsonb)",
      "public.withdraw_trailer_invite_attempt(text,text)",
    ];
    for (const name of privateFunctions) {
      for (const role of ["anon", "authenticated", "service_role"])
        assert.equal((await q("select has_function_privilege($1,$2,'execute') as allowed", [role,name])).rows[0].allowed, false, `${role} ${name}`);
    }
    for (const name of authenticatedFunctions) {
      assert.equal((await q("select has_function_privilege('authenticated',$1,'execute') as allowed", [name])).rows[0].allowed, true, name);
      assert.equal((await q("select has_function_privilege('anon',$1,'execute') as allowed", [name])).rows[0].allowed, false, name);
    }
    for (const role of ["anon", "authenticated", "service_role"])
      assert.equal((await q("select has_function_privilege($1,'public.can_see(uuid,uuid,text)','execute') as allowed", [role])).rows[0].allowed, role !== "anon", `${role} can_see`);
    for (const name of anonFunctions) {
      assert.equal((await q("select has_function_privilege('anon',$1,'execute') as allowed", [name])).rows[0].allowed, true, name);
      assert.equal((await q("select has_function_privilege('authenticated',$1,'execute') as allowed", [name])).rows[0].allowed, false, name);
    }
    for (const name of invitePrivateFunctions) {
      for (const role of ["anon", "authenticated", "service_role"])
        assert.equal((await q("select has_function_privilege($1,$2,'execute') as allowed", [role,name])).rows[0].allowed, false, `${role} ${name}`);
    }
    for (const name of inviteLeadFunctions) {
      for (const role of ["anon", "authenticated", "service_role"])
        assert.equal((await q("select has_function_privilege($1,$2,'execute') as allowed", [role,name])).rows[0].allowed, role === "authenticated", `${role} ${name}`);
    }
    for (const name of inviteCandidateFunctions) {
      for (const role of ["anon", "authenticated", "service_role"])
        assert.equal((await q("select has_function_privilege($1,$2,'execute') as allowed", [role,name])).rows[0].allowed, role !== "service_role", `${role} ${name}`);
    }
    for (const role of ["anon", "authenticated", "service_role"])
      assert.equal((await q("select has_function_privilege($1,'public.purge_expired_trailer_invites()','execute') as allowed", [role])).rows[0].allowed, role === "service_role", `${role} purge_expired_trailer_invites`);
    const publicGrants = await q("select count(*)::int as count from information_schema.routine_privileges where routine_schema in ('public','private') and grantee='PUBLIC' and routine_name like '%admin%'");
    assert.equal(publicGrants.rows[0].count, 0);
  });
  await check("non-admins are forbidden from every metadata read RPC", () => asUser(ids.member, async () => {
    assert.equal((await q("select admin_org_id() as org")).rows[0].org, null);
    for (const sql of [
      "select admin_overview()", "select admin_members()", "select admin_sources()",
      "select admin_answer_stats(current_date-1,current_date)", "select admin_invites()",
      "select admin_events_list(10)",
    ]) await denied(sql);
  }));
  await check("admin overview is organization-scoped and contains metadata keys only", () => asUserWithEmail(adminIds.adminA, "admin-a@example.test", async () => {
    const overview = (await q("select admin_overview() as value")).rows[0].value;
      assert.deepEqual(Object.keys(overview).sort(), ["departments", "llm_calls_this_month", "org_name", "published_trailers", "trailer_publish_enabled"]);
    const departmentNames = overview.departments.map(row => row.name);
    assert.ok(departmentNames.includes("Admin Y"));
    assert.ok(departmentNames.includes("SQL fixture"));
    assert.equal(departmentNames.includes("Admin B"), false);
    assert.ok(overview.llm_calls_this_month >= 1);
    const forbiddenKeys = ["question", "content", "quote", "asked_by", "answer"];
    const keys = collectKeys(overview);
    forbiddenKeys.forEach(key => assert.equal(keys.has(key), false, key));
  }));
  await check("admin member listing never crosses organization boundaries", () => asUser(adminIds.adminA, async () => {
    const members = (await q("select admin_members() as value")).rows[0].value;
    assert.ok(members.some(row => row.user_id === adminIds.leadY));
    assert.equal(members.some(row => row.user_id === adminIds.memberB), false);
  }));
  await check("answer statistics are daily aggregates and reject ranges over 31 days", () => asUser(adminIds.adminA, async () => {
    const stats = (await q("select admin_answer_stats(current_date-1,current_date) as value")).rows[0].value;
    const y = stats.find(row => row.dept_id === adminIds.deptY);
    assert.equal(y.answered, 1);
    assert.equal(y.cited_dept, 1);
    assert.deepEqual(Object.keys(y).sort(), ["answered","cited_decisions","cited_dept","cited_leads_only","day","dept_id","dept_name","failed","refused"]);
    await assert.rejects(
      () => q("select admin_answer_stats(current_date-31,current_date)"),
      error => error.code === "22023" && error.message === "invalid_range",
    );
  }));
  await check("demo admin wrappers are anon-only and remove account identifiers", async () => {
    await db.exec("set role anon");
    try {
      const members = (await q("select demo_admin_members() as value")).rows[0].value;
      assert.ok(members.length > 0);
      assert.equal(members.some(row => "email" in row || "user_id" in row), false);
    } finally { await db.exec("reset role"); }
    await asUser(adminIds.adminA, async () => {
      for (const sql of ["select demo_admin_overview()", "select demo_admin_members()", "select demo_admin_sources()", "select demo_admin_answer_stats(current_date-1,current_date)"])
        await denied(sql);
    });
  });
  await check("organization admin status never expands can_see content access", () => asUser(ids.lead, async () => {
    assert.equal((await q("select id from items where dept_id=$1", [adminIds.deptY])).rows.length, 0);
    assert.equal((await q("select id from answers where dept_id=$1", [adminIds.deptY])).rows.length, 0);
    assert.equal((await q("select id from decision_requests where dept_id=$1", [adminIds.deptY])).rows.length, 0);
  }));
  await check("admin tables remain policy-free and admin events append-only even for service role", async () => {
    const tables = await q("select relname, relrowsecurity from pg_class where relname in ('org_admins','member_invites','admin_events') order by relname");
    assert.equal(tables.rows.length, 3);
    assert.equal(tables.rows.every(row => row.relrowsecurity), true);
    assert.equal((await q("select count(*)::int as count from pg_policies where tablename in ('org_admins','member_invites','admin_events')")).rows[0].count, 0);
    await db.exec("set role service_role");
    try {
      await denied("update admin_events set target='{}'::jsonb where org_id=$1", [ids.org]);
      await denied("delete from admin_events where org_id=$1", [ids.org]);
    } finally { await db.exec("reset role"); }
  });
  await check("department names are unique case-insensitively inside an organization", async () => {
    await assert.rejects(
      () => q("insert into departments(org_id,name) values($1,'sql FIXTURE')", [ids.org]),
      error => error.code === "23505",
    );
  });

  await check("organization admins cannot target another organization", () => asUserWithEmail(adminIds.adminA, "admin-a@example.test", async () => {
    for (const [sql,message] of [
      ["select * from admin_invite_first_lead($1,'new@example.test')", "forbidden"],
      ["select revoke_invite($1)", "forbidden"],
      ["select demote_lead($1,$2)", "forbidden"],
      ["select remove_member($1,$2)", "forbidden"],
    ]) {
      const params = sql.includes("$2") ? [adminIds.memberB,adminIds.deptB] : [sql.includes("invite_first") ? adminIds.deptB : adminIds.crossBInvite];
      await assert.rejects(() => q(sql,params), error => error.code==="42501" && error.message===message);
    }
  }));
  await check("admin write surface has no promotion RPC", async () => {
    assert.equal((await q("select count(*)::int as count from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'admin_%promote%'")).rows[0].count,0);
  });
  let createdDept;
  await check("admin creates a trimmed department and cannot duplicate its name", () => asUser(adminIds.adminA, async () => {
    createdDept=(await q("select admin_create_department('  Operations  ') as id")).rows[0].id;
    assert.ok(createdDept);
    await assert.rejects(() => q("select admin_create_department('operations')"), error => error.code==="P0001" && error.message==="department_name_taken");
  }));
  await check("first-lead invites reject nonempty departments and the admin's own email", () => asUserWithEmail(adminIds.adminA,"admin-a@example.test",async () => {
    await assert.rejects(() => q("select * from admin_invite_first_lead($1,'fresh@example.test')",[adminIds.deptY]), error => error.message==="department_not_empty");
    await assert.rejects(() => q("select * from admin_invite_first_lead($1,'ADMIN-A@example.test')",[createdDept]), error => error.code==="42501" && error.message==="self_invite_forbidden");
  }));
  await check("members cannot use lead invite, promotion, or invite listing commands", () => asUser(ids.member, async () => {
    for (const [sql,params] of [
      ["select * from lead_invite_member($1,'x@example.test')",[ids.dept]],
      ["select lead_promote_member($1,$2)",[ids.memberB,ids.dept]],
      ["select lead_invites($1)",[ids.dept]],
    ]) await assert.rejects(() => q(sql,params), error => error.code==="42501" && error.message==="forbidden");
  }));
  await check("demo departments reject lead administration", () => asUser(ids.lead, async () => {
    await assert.rejects(() => q("select * from lead_invite_member($1,'x@example.test')",[removalIds.demoDept]), error => error.code==="42501" && error.message==="forbidden");
  }));
  await check("the final department lead cannot be demoted or removed", () => asUser(adminIds.adminA, async () => {
    for (const sql of ["select demote_lead($1,$2)","select remove_member($1,$2)"])
      await assert.rejects(() => q(sql,[adminIds.leadY,adminIds.deptY]), error => error.message==="last_lead");
  }));
  let acceptedToken;
  await check("first-lead invitation is single-use, email-bound, and idempotent for its recipient", async () => {
    await asUserWithEmail(adminIds.adminA,"admin-a@example.test",async () => {
      const invite=(await q("select * from admin_invite_first_lead($1,'invitee@example.test')",[createdDept])).rows[0];
      acceptedToken=invite.token;
      assert.equal(acceptedToken.length,64);
    });
    await db.exec("set role anon");
    try {
      const preview=(await q("select invite_preview($1) as value",[acceptedToken])).rows[0].value;
      assert.equal(preview.status,"valid"); assert.equal(preview.email_masked,"in***@example.test");
    } finally { await db.exec("reset role"); }
    await asUserWithEmail(adminIds.otherInvitee,"other-invitee@example.test",async () => {
      await assert.rejects(() => q("select accept_invite($1,'Wrong user')",[acceptedToken]), error => error.message==="invite_email_mismatch");
    });
    await asUserWithEmail(adminIds.invitee,"invitee@example.test",async () => {
      assert.equal((await q("select accept_invite($1,'  초대 부서장  ') as dept",[acceptedToken])).rows[0].dept,createdDept);
      assert.equal((await q("select accept_invite($1,'ignored') as dept",[acceptedToken])).rows[0].dept,createdDept);
    });
    const member=(await q("select role,display_name,consented_at from members where user_id=$1 and dept_id=$2",[adminIds.invitee,createdDept])).rows[0];
    assert.deepEqual(member,{role:"lead",display_name:"초대 부서장",consented_at:null});
    const stored=(await q("select token_hash,used_token_hash from member_invites where dept_id=$1 and accepted_by=$2",[createdDept,adminIds.invitee])).rows[0];
    assert.ok(stored.token_hash.startsWith("void:")); assert.equal(stored.used_token_hash.length,64);
    await asUserWithEmail(adminIds.otherInvitee,"other-invitee@example.test",async () => {
      await assert.rejects(() => q("select accept_invite($1,'Other')",[acceptedToken]), error => error.message==="invite_used");
    });
  });
  await check("a spare admin first-lead invite cannot be accepted once the department has members (R10)", async () => {
    await asUser(adminIds.adminA,async () => { adminIds.spareDept=(await q("select admin_create_department('Spare invite dept') as id")).rows[0].id; });
    let firstToken;
    await asUserWithEmail(adminIds.adminA,"admin-a@example.test",async () => {
      firstToken=(await q("select token from admin_invite_first_lead($1,'invitee@example.test')",[adminIds.spareDept])).rows[0].token;
      await assert.rejects(() => q("select * from admin_invite_first_lead($1,'other-invitee@example.test')",[adminIds.spareDept]), error => error.code==="P0001" && error.message==="invite_pending");
    });
    // A second live admin invite created outside the RPC rule (legacy data or a race) must still fail at acceptance.
    const spareToken="c".repeat(64);
    await q("insert into member_invites(org_id,dept_id,invited_by_role,email_normalized,role,token_hash,expires_at) select org_id,id,'org_admin','other-invitee@example.test','lead',encode(sha256(convert_to($2,'UTF8')),'hex'),now()+interval '7 days' from departments where id=$1",[adminIds.spareDept,spareToken]);
    await asUserWithEmail(adminIds.invitee,"invitee@example.test",async () => {
      assert.equal((await q("select accept_invite($1,'첫 부서장') as dept",[firstToken])).rows[0].dept,adminIds.spareDept);
    });
    await asUserWithEmail(adminIds.otherInvitee,"other-invitee@example.test",async () => {
      await assert.rejects(() => q("select accept_invite($1,'늦은 초대')",[spareToken]), error => error.code==="P0001" && error.message==="department_not_empty");
    });
    assert.equal((await q("select count(*)::int as count from members where dept_id=$1",[adminIds.spareDept])).rows[0].count,1);
  });
  let revokedToken;
  await check("revoked invitations remain previewable but cannot be accepted", async () => {
    await asUser(adminIds.adminA,async () => { adminIds.revokedDept=(await q("select admin_create_department('Revoked dept') as id")).rows[0].id; });
    let inviteId;
    await asUserWithEmail(adminIds.adminA,"admin-a@example.test",async () => {
      const invite=(await q("select * from admin_invite_first_lead($1,'other-invitee@example.test')",[adminIds.revokedDept])).rows[0]; inviteId=invite.invite_id; revokedToken=invite.token;
      await q("select revoke_invite($1)",[inviteId]);
    });
    await db.exec("set role anon"); try { assert.equal((await q("select invite_preview($1) as value",[revokedToken])).rows[0].value.status,"revoked"); } finally { await db.exec("reset role"); }
    await asUserWithEmail(adminIds.otherInvitee,"other-invitee@example.test",async () => {
      await assert.rejects(() => q("select accept_invite($1,'Other')",[revokedToken]), error => error.message==="invite_revoked");
    });
  });
  await check("expired invitations cannot be accepted", async () => {
    await asUser(adminIds.adminA,async () => { adminIds.expiredDept=(await q("select admin_create_department('Expired dept') as id")).rows[0].id; });
    let token;
    await asUserWithEmail(adminIds.adminA,"admin-a@example.test",async () => { token=(await q("select token from admin_invite_first_lead($1,'other-invitee@example.test')",[adminIds.expiredDept])).rows[0].token; });
    await q("update member_invites set expires_at=now()-interval '1 minute' where dept_id=$1",[adminIds.expiredDept]);
    await asUserWithEmail(adminIds.otherInvitee,"other-invitee@example.test",async () => {
      await assert.rejects(() => q("select accept_invite($1,'Other')",[token]), error => error.message==="invite_expired");
    });
  });
  await check("lead invitations are member-only, pending-deduplicated, and promotable only by a lead", () => asUser(ids.lead, async () => {
    const invite=(await q("select * from lead_invite_member($1,'new-member@example.test')",[ids.dept])).rows[0];
    assert.equal(invite.token.length,64);
    await assert.rejects(() => q("select * from lead_invite_member($1,'NEW-MEMBER@example.test')",[ids.dept]), error => error.message==="invite_pending");
    const listed=(await q("select lead_invites($1) as value",[ids.dept])).rows[0].value;
    assert.ok(listed.some(row => row.invite_id===invite.invite_id && row.role==="member"));
    await q("select lead_promote_member($1,$2)",[ids.member,ids.dept]);
    assert.equal((await q("select role from members where user_id=$1 and dept_id=$2",[ids.member,ids.dept])).rows[0].role,"lead");
  }));
  await check("all write RPCs keep admin event targets identifier-only", async () => {
    const events=(await q("select target from admin_events")).rows;
    for (const {target} of events) {
      assert.equal(JSON.stringify(target).includes("@"),false);
      for (const key of Object.keys(target)) assert.ok(["dept_id","invite_id","user_id"].includes(key),key);
    }
  });
  await check("organization pending-invite limit is atomic at the command boundary", async () => {
    const count=(await q("select count(*)::int as count from member_invites where org_id=$1 and accepted_at is null and revoked_at is null",[ids.org])).rows[0].count;
    for(let index=count;index<100;index++) await q("insert into member_invites(org_id,dept_id,invited_by_role,email_normalized,role,token_hash,expires_at,created_by) values($1,$2,'lead',$3,'member',$4,now()+interval '7 days',$5)",[ids.org,ids.dept,`limit-${index}@example.test`,`limit-hash-${index}`,ids.lead]);
    await asUser(ids.lead,async () => {
      await assert.rejects(() => q("select * from lead_invite_member($1,'over-limit@example.test')",[ids.dept]), error => error.message==="invite_limit");
    });
  });

  await verifyAnswerGroundingSql({ q, check, asUser });
  await verifyTrailerSql({ db, q, check, asUser, ids, adminIds });
  await verifyTrailerAssessmentSql({ db, q, check, asUser, ids });
  await verifySlackAskSql({ db, q, check, asUser });
  await verifySourceLifecycleSql({ db, q, check, asUser });
  await verifyDecisionFollowupSql({ db, q, check, asUser });
  await verifyConversationsSql({ db, q, check, asUser });
  await verifySlackInstallationsSql({ db, q, check, asUser });
  await verifyNotionInstallationsSql({ q, check, asUser });
  await verifyNotionImportV2Sql({ q, check, asUser });
  await verifyNotionRootsSql({ db, q, check, asUser });
  await verifyNotionBulkLaneSql({ db, q, check, asUser });
  await verifyNotionPollSql({ db, q, check, asUser });
  await verifyReviewedMaterialsSql({ db, q, check, asUser });
  await verifyReviewAccessSql({ db, q, check, asUser });
  await verifyRetroSql({ db, q, check, asUser });
  await verifyRetroConnectionsSql({ db, q, check, asUser });
  await verifyRecordingSessionsSql({ db, q, check, asUser });
  await verifyRecordingSegmentsSql({ db, q, check, asUser });
  await verifyReviewUploadTimeoutSql({ q, check, asUser, ids });
  await verifySalesReviewSql({ q, check, asUser, denied, ids });
  await verifySalesSourceReviewSql({q,check,asUser,denied,ids});
  await verifyDeviceLinksSql({q,check});
  const glossaryIds = { dept: randomUUID(), lead: randomUUID(), member: randomUUID() };
  await q("insert into departments(id,org_id,name) values($1,$2,'Glossary QA')", [glossaryIds.dept,ids.org]);
  await q("insert into auth.users(id) values($1),($2)", [glossaryIds.lead,glossaryIds.member]);
  await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$3,'lead','Glossary lead',now()),($2,$3,'member','Glossary member',now())", [glossaryIds.lead,glossaryIds.member,glossaryIds.dept]);
  await check("department glossary: lead edits, member reads, other department sees no terms", async () => {
    let termId;
    await asUser(glossaryIds.lead, async () => {
      termId = (await q("select save_dept_glossary($1,null,'사수',null,'결정 지원') id", [glossaryIds.dept])).rows[0].id;
      assert.ok(termId);
    });
    await asUser(glossaryIds.member, async () => {
      assert.equal((await q("select term from dept_glossaries where dept_id=$1", [glossaryIds.dept])).rows.length, 1);
      await denied("select save_dept_glossary($1,null,'위조',null,null)", [glossaryIds.dept]);
      await denied("insert into dept_glossaries(dept_id,term,created_by) values($1,'위조',$2)", [glossaryIds.dept,glossaryIds.member]);
    });
    await asUser(adminIds.leadY, async () => {
      assert.equal((await q("select term from dept_glossaries where dept_id=$1", [glossaryIds.dept])).rows.length, 0);
    });
  });
  await check("department glossary: duplicate and personal data are rejected before storage", async () => {
    await asUser(glossaryIds.lead, async () => {
      await assert.rejects(() => q("select save_dept_glossary($1,null,'사수',null,null)", [glossaryIds.dept]), error => error.code === "23505");
      await assert.rejects(() => q("select save_dept_glossary($1,null,'qa@example.com',null,null)", [glossaryIds.dept]), error => error.code === "22023");
    });
  });
  console.log(JSON.stringify({ passed, failed: 0, matrix: { organizations:4, departments:12, actors:24, items:72, assertions:matrixAssertions }, database: "isolated PGlite", excluded: ["0004_worker_cron.sql (pg_cron/pg_net not available)"] }));
} finally {
  await db.close();
}
