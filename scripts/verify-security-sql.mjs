// Isolated PostgreSQL/WASM checks. Never loads .env or connects to Supabase.
// npm install --prefix <temporary-directory> @electric-sql/pglite@0.5.8 @electric-sql/pglite-pgvector@0.0.9
// node scripts/verify-security-sql.mjs <temporary-directory>
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(resolve(process.argv[2] ?? ".", "package.json"));
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
].map(key => [key, randomUUID()]));
const removalIds = Object.fromEntries([
  "source", "item", "request", "demoOrg", "demoDept", "demoSource",
].map(key => [key, randomUUID()]));
const q = (sql, params = []) => db.query(sql, params);
const cosineVector = similarity => {
  const values = Array(1024).fill(0);
  values[0] = similarity;
  values[1] = Math.sqrt(1 - similarity ** 2);
  return JSON.stringify(values);
};
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
async function asUser(id, fn) {
  await db.exec("set role authenticated");
  await q("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', 'authenticated', false)", [id]);
  try { await fn(); } finally {
    await db.exec("reset role");
    await q("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'service_role', false)");
  }
}
async function denied(sql, params = []) {
  await assert.rejects(() => q(sql, params), error => error.code === "42501");
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);
  const migrations = readdirSync("supabase/migrations")
    .filter(name => name.endsWith(".sql") && !name.startsWith("0004_"))
    .sort();
  const boundaryMigration = "0017_card_decision_boundaries.sql";
  for (const file of migrations.filter(name => name < boundaryMigration)) {
    await db.exec(readFileSync(resolve("supabase/migrations", file), "utf8"));
  }
  await q("insert into orgs(id,name) values ($1,'backfill fixture')", [backfillIds.org]);
  await q("insert into departments(id,org_id,name) values ($1,$2,'backfill fixture')", [backfillIds.dept,backfillIds.org]);
  await q("insert into sources(id,dept_id,kind,external_id,visibility) values ($1,$2,'document','backfill-private','leads_only')", [backfillIds.privateSource,backfillIds.dept]);
  await q("insert into items(id,source_id,dept_id,content) values ($1,$2,$3,'backfill private evidence')", [backfillIds.privateItem,backfillIds.privateSource,backfillIds.dept]);
  await q("insert into decision_requests(id,dept_id,title,background,visibility) values ($1,$2,'backfill card','backfill card','leads_only')", [backfillIds.card,backfillIds.dept]);
  await q("insert into decisions(id,dept_id,request_id,decided_by_name,outcome,rationale) values ($1,$2,$3,'backfill actor','backfill card outcome','backfill reason'),($4,$2,null,'backfill actor','backfill direct outcome','backfill reason')", [backfillIds.cardDecision,backfillIds.dept,backfillIds.card,backfillIds.directDecision]);
  await q("insert into citations(owner_kind,owner_id,item_id,quote) values ('decision',$1,$2,'backfill private evidence')", [backfillIds.directDecision,backfillIds.privateItem]);
  await db.exec(readFileSync(resolve("supabase/migrations", boundaryMigration), "utf8"));
  for (const file of migrations.filter(name => name > boundaryMigration)) {
    await db.exec(readFileSync(resolve("supabase/migrations", file), "utf8"));
  }
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
  await q("insert into sources(id,dept_id,kind,external_id,visibility) values ($1,$2,'slack_channel','removal-source','dept')", [removalIds.source, ids.dept]);
  await q("insert into items(id,source_id,dept_id,content,embedding,embed_model) values ($1,$2,$3,'removal evidence',$4,'voyage-4-lite')", [removalIds.item, removalIds.source, ids.dept, embedding]);
  await q("insert into classifications(item_id,label,method) values ($1,'decision','llm')", [removalIds.item]);
  await q("insert into decision_requests(id,dept_id,title,background,visibility) values ($1,$2,'removal card','removal card','dept')", [removalIds.request, ids.dept]);
  await q("insert into citations(owner_kind,owner_id,item_id,quote) values ('decision_request',$1,$2,'removal evidence')", [removalIds.request, removalIds.item]);
  await q("insert into orgs(id,name,is_demo) values ($1,'demo removal',true)", [removalIds.demoOrg]);
  await q("insert into departments(id,org_id,name) values ($1,$2,'demo removal')", [removalIds.demoDept, removalIds.demoOrg]);
  await q("insert into members(user_id,dept_id,role,display_name,consented_at) values ($1,$2,'lead','demo lead',now())", [ids.lead, removalIds.demoDept]);
  await q("insert into sources(id,dept_id,kind,external_id) values ($1,$2,'slack_channel','demo-removal-source')", [removalIds.demoSource, removalIds.demoDept]);
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
  await check("find_merge_target includes the 72h/0.85 boundaries and rejects stale, closed, or sub-threshold cards", async () => {
    await db.exec("begin");
    try {
      await q("insert into departments(id,org_id,name) values ($1,$3,'merge-boundary'),($2,$3,'merge-visibility')", [mergeIds.boundaryDept,mergeIds.visibilityDept,ids.org]);
      await q("insert into sources(id,dept_id,kind,external_id,visibility) values ($1,$3,'document','merge-boundary','dept'),($2,$4,'document','merge-visibility','dept')", [mergeIds.boundarySource,mergeIds.visibilitySource,mergeIds.boundaryDept,mergeIds.visibilityDept]);
      await q("insert into items(id,source_id,dept_id,content,embedding,embed_model) values ($1,$5,$6,'exact boundary',$9,'voyage-4-lite'),($2,$5,$6,'below threshold',$10,'voyage-4-lite'),($3,$5,$6,'stale candidate',$11,'voyage-4-lite'),($4,$5,$6,'closed candidate',$11,'voyage-4-lite'),($7,$8,$12,'dept candidate',$11,'voyage-4-lite'),($13,$8,$12,'lead candidate',$14,'voyage-4-lite')", [mergeIds.exactItem,mergeIds.belowItem,mergeIds.oldItem,mergeIds.closedItem,mergeIds.boundarySource,mergeIds.boundaryDept,mergeIds.deptItem,mergeIds.visibilitySource,cosineVector(0.85),cosineVector(0.849),mergeQuery,mergeIds.visibilityDept,mergeIds.leadItem,cosineVector(0.9)]);
      await q("insert into decision_requests(id,dept_id,title,background,visibility,status,opened_at) values ($1,$7,'exact','exact','dept','open',now()-interval '72 hours'),($2,$7,'below','below','dept','open',now()-interval '1 hour'),($3,$7,'old','old','dept','open',now()-interval '72 hours 1 second'),($4,$7,'closed','closed','dept','decided',now()-interval '1 hour'),($5,$8,'dept','dept','dept','open',now()-interval '1 hour'),($6,$8,'lead','lead','leads_only','open',now()-interval '1 hour')", [mergeIds.exactCard,mergeIds.belowCard,mergeIds.oldCard,mergeIds.closedCard,mergeIds.deptCard,mergeIds.leadCard,mergeIds.boundaryDept,mergeIds.visibilityDept]);
      await q("insert into citations(owner_kind,owner_id,item_id,quote) values ('decision_request',$1,$7,'exact boundary'),('decision_request',$2,$8,'below threshold'),('decision_request',$3,$9,'stale candidate'),('decision_request',$4,$10,'closed candidate'),('decision_request',$5,$11,'dept candidate'),('decision_request',$6,$12,'lead candidate')", [mergeIds.exactCard,mergeIds.belowCard,mergeIds.oldCard,mergeIds.closedCard,mergeIds.deptCard,mergeIds.leadCard,mergeIds.exactItem,mergeIds.belowItem,mergeIds.oldItem,mergeIds.closedItem,mergeIds.deptItem,mergeIds.leadItem]);
      await db.exec("set role service_role");
      const boundary = await q("select * from find_merge_target($1,$2,'dept',$3)", [mergeIds.boundaryDept,mergeQuery,randomUUID()]);
      assert.equal(boundary.rows.length, 1);
      assert.equal(boundary.rows[0].request_id, mergeIds.exactCard);
      assert.ok(Math.abs(boundary.rows[0].similarity - 0.85) < 0.00001);
      assert.equal((await q("select * from find_merge_target($1,$2,'dept',$3)", [mergeIds.boundaryDept,mergeQuery,mergeIds.exactItem])).rows.length, 0);
      await db.exec("reset role");
      await db.exec("commit");
    } catch (error) {
      await db.exec("reset role").catch(() => undefined);
      await db.exec("rollback").catch(() => undefined);
      throw error;
    }
  });
  await check("find_merge_target refuses visibility narrowing and remains service-role-only", async () => {
    await db.exec("set role service_role");
    try {
      const privateOrigin = await q("select * from find_merge_target($1,$2,'leads_only',$3)", [mergeIds.visibilityDept,mergeQuery,randomUUID()]);
      assert.equal(privateOrigin.rows[0].request_id, mergeIds.leadCard);
      const publicOrigin = await q("select * from find_merge_target($1,$2,'dept',$3)", [mergeIds.visibilityDept,mergeQuery,randomUUID()]);
      assert.equal(publicOrigin.rows[0].request_id, mergeIds.deptCard);
    } finally {
      await db.exec("reset role");
    }
    await asUser(ids.lead, () => denied("select * from find_merge_target($1,$2,'dept',$3)", [mergeIds.visibilityDept,mergeQuery,randomUUID()]));
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
    assert.equal((await q("select * from recent_channel_decisions_as($1,$2,3)",[ids.lead,ids.dept])).rows.length,3);
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
  console.log(JSON.stringify({ passed, failed: 0, matrix: { organizations:4, departments:12, actors:24, items:72, assertions:matrixAssertions }, database: "isolated PGlite", excluded: ["0004_worker_cron.sql (pg_cron/pg_net not available)"] }));
} finally {
  await db.close();
}
