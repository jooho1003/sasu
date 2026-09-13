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
const ids = Object.fromEntries(["org", "dept", "lead", "member", "publicSource", "privateSource", "publicItem", "privateItem", "card", "decision", "answer", "pending", "failed"].map(key => [key, randomUUID()]));
const q = (sql, params = []) => db.query(sql, params);
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
  for (const file of readdirSync("supabase/migrations").filter(name => name.endsWith(".sql") && !name.startsWith("0004_")).sort()) {
    await db.exec(readFileSync(resolve("supabase/migrations", file), "utf8"));
  }
  await q("insert into auth.users values ($1),($2)", [ids.lead, ids.member]);
  await q("insert into orgs(id,name) values ($1,'SQL fixture')", [ids.org]);
  await q("insert into departments(id,org_id,name) values ($1,$2,'SQL fixture')", [ids.dept,ids.org]);
  await q("insert into members(user_id,dept_id,role,display_name,consented_at) values ($1,$3,'lead','lead',now()),($2,$3,'member','member',now())", [ids.lead,ids.member,ids.dept]);
  await q("insert into sources(id,dept_id,kind,external_id,visibility) values ($1,$3,'slack_channel','public','dept'),($2,$3,'slack_channel','private','leads_only')", [ids.publicSource,ids.privateSource,ids.dept]);
  const embedding = JSON.stringify(Array(1024).fill(0.01));
  await q("insert into items(id,source_id,dept_id,content,embedding,embed_model) values ($1,$3,$5,'public evidence',$6,'voyage-4-lite'),($2,$4,$5,'private evidence',$6,'voyage-4-lite')", [ids.publicItem,ids.privateItem,ids.publicSource,ids.privateSource,ids.dept,embedding]);
  await q("insert into decision_requests(id,dept_id,title,background,visibility,assignee_id) values ($1,$2,'private card','private background','leads_only',$3)", [ids.card,ids.dept,ids.lead]);
  await q("insert into decisions(id,dept_id,request_id,decided_by,decided_by_name,outcome,rationale) values ($1,$2,$3,$4,'lead','private outcome','private rationale')", [ids.decision,ids.dept,ids.card,ids.lead]);
  for (const [key,status] of [["answer","done"],["pending","pending"],["failed","failed"]]) {
    await q("insert into answers(id,dept_id,asked_by,question,status) values ($1,$2,$3,'synthetic question',$4)", [ids[key],ids.dept,ids.lead,status]);
  }
  await check("member cannot read lead answer or private ledger", () => asUser(ids.member, async () => {
    assert.equal((await q("select id from answers")).rows.length, 0);
    assert.equal((await q("select id from decisions")).rows.length, 0);
    assert.equal((await q("select * from recent_decisions_as($1,$2,3)",[ids.member,ids.dept])).rows.length,0);
  }));
  await check("lead user search sees private evidence; channel search does not", () => asUser(ids.lead, async () => {
    assert.equal((await q("select * from search_as($1,$2,$3,8)",[ids.lead,ids.dept,embedding])).rows.length,2);
    const channel = await q("select * from search_channel_as($1,$2,$3,8)",[ids.lead,ids.dept,embedding]);
    assert.deepEqual(channel.rows.map(row => row.id),[ids.publicItem]);
    assert.equal((await q("select * from recent_decisions_as($1,$2,3)",[ids.lead,ids.dept])).rows.length,1);
    assert.equal((await q("select * from recent_channel_decisions_as($1,$2,3)",[ids.lead,ids.dept])).rows.length,0);
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
    await denied("update decisions set outcome='forged' where id=$1",[ids.decision]);
    await denied("delete from decisions where id=$1",[ids.decision]);
  }));
  await check("users cannot manufacture completed AI answers", () => asUser(ids.lead, async () => {
    await denied("update answers set answer='forged' where id=$1",[ids.answer]);
    await denied("insert into answers(dept_id,asked_by,question,status,answer) values($1,$2,'forged','done','forged')",[ids.dept,ids.lead]);
  }));
  // 독립된 4개 조직 × 3개 부서. 모든 actor/대상 부서 조합을 실제 RLS와 RPC에 대입한다.
  await q("update members set slack_user_id='U_ATOMIC', consented_at=now() where user_id=$1", [ids.member]);
  const ingest = (event, kind = 'item', content = 'synthetic masked body', ext = '123.45') =>
    q("select ingest_slack_atomic($1,$2,'U_ATOMIC',$3,$4,$5,null,'123.45') as saved", [event, ids.publicSource, kind, content, ext]);
  await check("Slack event/item/job commit atomically and duplicate delivery is a no-op", async () => {
    assert.equal((await ingest('atomic-1')).rows[0].saved, true);
    assert.equal((await ingest('atomic-1')).rows[0].saved, false);
    assert.equal((await q("select id from items where source_id=$1 and external_ref='123.45'", [ids.publicSource])).rows.length, 1);
    assert.equal((await q("select id from jobs where kind='classify' and payload->>'itemId' in (select id::text from items where source_id=$1 and external_ref='123.45')", [ids.publicSource])).rows.length, 1);
  });
  await check("job failure rolls back event and item; retry succeeds", async () => {
    await db.exec("create function fail_qa_job() returns trigger language plpgsql as $$ begin raise exception 'synthetic_job_failure'; end $$; create trigger fail_qa_job before insert on jobs for each row execute function fail_qa_job();");
    await assert.rejects(() => ingest('atomic-retry', 'item', 'synthetic retry', '123.46'));
    assert.equal((await q("select event_id from ingest_events where event_id='atomic-retry'")).rows.length, 0);
    assert.equal((await q("select id from items where source_id=$1 and external_ref='123.46'", [ids.publicSource])).rows.length, 0);
    await db.exec("alter table jobs disable trigger fail_qa_job");
    assert.equal((await ingest('atomic-retry', 'item', 'synthetic retry', '123.46')).rows[0].saved, true);
  });
  await check("Slack mention answer and job are idempotent", async () => {
    assert.equal((await ingest('atomic-ask', 'answer', 'synthetic masked question')).rows[0].saved, true);
    assert.equal((await ingest('atomic-ask', 'answer', 'synthetic masked question')).rows[0].saved, false);
    assert.equal((await q("select id from answers where question='synthetic masked question'")).rows.length, 1);
    assert.equal((await q("select id from jobs where kind='answer' and payload->'slackReply'->>'channel'='public'")).rows.length, 1);
  });
  await check("consent rechecked inside transaction; no unconsented body persists", async () => {
    await q("update members set consented_at=null where user_id=$1", [ids.member]);
    assert.equal((await ingest('atomic-no-consent', 'item', 'synthetic unconsented', '123.47')).rows[0].saved, false);
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
      await q("insert into decisions(dept_id,request_id,decided_by,decided_by_name,outcome,rationale) values($1,$2,$3,'synthetic-lead','synthetic outcome','synthetic rationale')",[dept.id,dept.card,dept.lead]);
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
