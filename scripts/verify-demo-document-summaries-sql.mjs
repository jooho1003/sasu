// ADR-092 phase 53 S1: anonymous demo read path for document_summaries.
// Isolated SQL scenarios; no environment files, production data or network.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export async function verifyDemoDocumentSummariesSql({ db, q, check, denied }) {
  const a = Object.fromEntries([
    "demoOrg", "demoDept", "realOrg", "realDept",
    "demoSource", "demoInactiveSource", "realSource", "demoItem",
  ].map(key => [key, randomUUID()]));
  const quote = "배포 전 점검표를 확인합니다.";
  const summary = JSON.stringify({
    citations: [{ item_id: a.demoItem, decision_id: null, quote }],
    overview: quote,
    key_points: [{ item_id: a.demoItem, text: quote }],
    decisions: [], actions: [], open_questions: [],
  });
  await q("insert into orgs(id,name,is_demo) values($1,'Demo summary QA',true),($2,'Real summary QA',false)", [a.demoOrg, a.realOrg]);
  await q("insert into departments(id,org_id,name) values($1,$2,'Demo summary'),($3,$4,'Real summary')", [a.demoDept, a.demoOrg, a.realDept, a.realOrg]);
  await q(
    "insert into sources(id,dept_id,kind,external_id,title,visibility) values($1,$4,'document','demo-summary-active','합성 회의록','dept'),($2,$4,'document','demo-summary-inactive','비활성 합성 문서','dept'),($3,$5,'document','real-summary','실제 문서','dept')",
    [a.demoSource, a.demoInactiveSource, a.realSource, a.demoDept, a.realDept],
  );
  await q("insert into items(id,source_id,dept_id,content) values($1,$2,$3,$4)", [a.demoItem, a.demoSource, a.demoDept, quote]);
  await q(
    "insert into document_summaries(source_id,dept_id,status,summary) values($1,$4,'summarized',$5::jsonb),($2,$4,'summarized',$5::jsonb),($3,$6,'summarized',$5::jsonb)",
    [a.demoSource, a.demoInactiveSource, a.realSource, a.demoDept, summary, a.realDept],
  );
  // Deactivation keeps the row (the 0034 trigger only clears its content); the policy must still hide it.
  await q("update sources set active=false where id=$1", [a.demoInactiveSource]);
  assert.equal((await q("select count(*)::int n from document_summaries where source_id=$1", [a.demoInactiveSource])).rows[0].n, 1);

  const asAnon = async fn => {
    await db.exec("set role anon");
    try { return await fn(); } finally { await db.exec("reset role"); }
  };
  const anonRows = dept => asAnon(async () => (await q("select source_id,status,summary from document_summaries where dept_id=$1 order by source_id", [dept])).rows);

  await check("demo document summaries: anon policy is SELECT-only and keeps the demo department condition", async () => {
    const policies = (await q("select policyname,cmd,roles::text roles,qual from pg_policies where schemaname='public' and tablename='document_summaries' and 'anon' = any(roles)")).rows;
    assert.deepEqual(policies.map(row => [row.policyname, row.cmd, row.roles]), [["document_summaries_demo_read", "SELECT", "{anon}"]]);
    assert.match(policies[0].qual, /is_demo_department\(dept_id\)/);
    assert.match(policies[0].qual, /active/);
  });
  await check("demo document summaries: anon reads exactly the active demo summary", async () => {
    const rows = await anonRows(a.demoDept);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source_id, a.demoSource);
    assert.equal(rows[0].status, "summarized");
    assert.equal(rows[0].summary.overview, quote);
  });
  await check("demo document summaries: anon sees 0 non-demo rows and 0 inactive-source rows", async () => {
    assert.equal((await anonRows(a.realDept)).length, 0);
    await asAnon(async () => {
      assert.equal((await q("select source_id from document_summaries where source_id=$1", [a.realSource])).rows.length, 0);
      assert.equal((await q("select source_id from document_summaries where source_id=$1", [a.demoInactiveSource])).rows.length, 0);
    });
  });
  await check("demo document summaries: anon INSERT is rejected and UPDATE/DELETE change nothing", async () => {
    const forged = randomUUID();
    await q("insert into sources(id,dept_id,kind,external_id,visibility) values($1,$2,'document','demo-summary-forged','dept')", [forged, a.demoDept]);
    await asAnon(async () => {
      await denied("insert into document_summaries(source_id,dept_id,status) values($1,$2,'summarized')", [forged, a.demoDept]);
      assert.equal((await q("update document_summaries set status='processing', summary=null where source_id=$1", [a.demoSource])).affectedRows ?? 0, 0);
      assert.equal((await q("delete from document_summaries where source_id=$1", [a.demoSource])).affectedRows ?? 0, 0);
    });
    const row = (await q("select status,summary from document_summaries where source_id=$1", [a.demoSource])).rows[0];
    assert.equal(row.status, "summarized");
    assert.equal(row.summary.overview, quote);
    assert.equal((await q("select count(*)::int n from document_summaries where source_id=$1", [forged])).rows[0].n, 0);
    for (const command of ["INSERT", "UPDATE", "DELETE"]) {
      assert.equal((await q("select count(*)::int n from pg_policies where schemaname='public' and tablename='document_summaries' and cmd in ('ALL',$1) and ('anon' = any(roles) or 'public' = any(roles))", [command])).rows[0].n, 0, command);
    }
  });
  await check("demo document summaries: 0070 rollback removes the anonymous read path", async () => {
    await db.exec("begin");
    try {
      await db.exec(readFileSync(resolve("supabase/rollback/0070_demo_document_summaries_read_down.sql"), "utf8"));
      assert.equal((await anonRows(a.demoDept)).length, 0);
    } finally { await db.exec("rollback"); }
    assert.equal((await anonRows(a.demoDept)).length, 1);
  });
}
