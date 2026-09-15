import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

export async function verifyTrailerSql({ db, q, check, asUser, ids, adminIds }) {
  const fixture = JSON.parse(readFileSync("tests/fixtures/trailer-approval.json", "utf8"));
  const rubric = JSON.stringify([{ key: "evidence", label: "근거 확인", description: "사실을 확인했는가", weight: 3 }]);
  const names = ["dept", "otherDept", "lead", "member", "otherLead", "decision", "otherDecision", "privateDecision", "oldDecision", "newDecision", "demoDept", "demoOrg"];
  const f = Object.fromEntries(names.map((name) => [name, randomUUID()]));
  await q("insert into auth.users(id) values($1),($2),($3)", [f.lead, f.member, f.otherLead]);
  await q("insert into orgs(id,name,is_demo) values($1,'예고편 데모 테스트',true)", [f.demoOrg]);
  await q("insert into departments(id,org_id,name) values($1,$2,'예고편 부서'),($3,$2,'예고편 다른 부서'),($4,$5,'예고편 데모')", [f.dept, ids.org, f.otherDept, f.demoDept, f.demoOrg]);
  await q("insert into members(user_id,dept_id,role,display_name) values($1,$2,'lead','예고편 부서장'),($3,$2,'member','예고편 멤버'),($4,$5,'lead','다른 부서장'),($1,$6,'lead','데모 부서장')", [f.lead, f.dept, f.member, f.otherLead, f.otherDept, f.demoDept]);
  for (const [id, dept, visibility, supersedes] of [[f.decision,f.dept,"dept",null],[f.otherDecision,f.otherDept,"dept",null],[f.privateDecision,f.dept,"leads_only",null],[f.oldDecision,f.dept,"dept",null],[f.newDecision,f.dept,"dept",f.oldDecision]]) {
    await q("insert into decisions(id,dept_id,visibility,decided_by_name,outcome,rationale,supersedes_id) values($1,$2,$3,'합성 결정자','후속 범위를 먼저 확인합니다.','확정한 범위를 기록합니다.',$4)", [id,dept,visibility,supersedes]);
  }
  const createSql = "select * from create_trailer_draft($1,$2::uuid[],$3::text[],$4,$5::jsonb)";
  const createArgs = (overrides = {}) => [overrides.dept ?? f.dept, `{${(overrides.decisions ?? [f.decision]).join(",")}}`, overrides.terms ?? "{}", overrides.url ?? null, overrides.rubric ?? rubric];
  const rejection = (code) => (error) => error.message === code;
  const denied = (error) => error.code === "42501";
  async function service(fn) {
    await db.exec("set role service_role");
    await q("select set_config('request.jwt.claim.role','service_role',false)");
    try { return await fn(); } finally { await db.exec("reset role"); }
  }
  async function create() {
    let result;
    await asUser(f.lead,async () => { result=(await q(createSql,createArgs())).rows[0]; });
    return result;
  }
  const get = async (id) => (await q("select * from trailers where id=$1",[id])).rows[0];
  const gate = async (id, passed = true, timestamp) => service(async () => {
    const t=await get(id);
    return (await q("select record_trailer_gate($1,$2::jsonb,$3,$4) as result",[id,JSON.stringify({passed,violations:passed?[]:[{path:"scenarios[0].title",rule:"overlap"}]}),passed,timestamp??t.updated_at])).rows[0].result;
  });
  const generated = async (id, scenarios = fixture.scenarios) => service(() => q("update trailers set scenarios=$2::jsonb,status='checking' where id=$1",[id,JSON.stringify(scenarios)]));

  await check("trailer candidates reject members and exclude private, cross-department and superseded decisions", async () => {
    await asUser(f.member,() => assert.rejects(() => q("select trailer_candidates($1)",[f.dept]),denied));
    await asUser(f.lead,async () => {
      const candidates=(await q("select trailer_candidates($1) as result",[f.dept])).rows[0].result;
      assert.deepEqual(candidates.map(x=>x.decision_id).sort(),[f.decision,f.newDecision].sort());
      assert.deepEqual(Object.keys(candidates[0]).sort(),["card_title","decided_at","decision_id","outcome"]);
      for (const decisions of [[f.otherDecision],[f.privateDecision],[f.oldDecision],[f.decision,f.decision]]) await assert.rejects(() => q(createSql,createArgs({decisions})),rejection("trailer_decisions_invalid"));
      await assert.rejects(() => q(createSql,createArgs({dept:f.demoDept})),denied);
      await assert.rejects(() => q(createSql,createArgs({url:"http://example.test/apply"})),rejection("invalid_apply_url"));
      await assert.rejects(() => q(createSql,createArgs({terms:'{" "}'})),rejection("invalid_banned_terms"));
      await assert.rejects(() => q(createSql,createArgs({rubric:'[{"key":"a","weight":9}]'})),rejection("invalid_rubric"));
    });
  });
  let main;
  await check("trailer generation counter atomically rejects the 21st draft without adding a row", async () => {
    for(let index=0;index<20;index++) { const row=await create(); if(!main) main=row.trailer_id; }
    await asUser(f.lead,() => assert.rejects(() => q(createSql,createArgs()),rejection("trailer_daily_limit")));
    assert.equal((await q("select count(*)::int n from trailers where dept_id=$1",[f.dept])).rows[0].n,20);
    assert.equal((await q("select count from trailer_generation_counters where dept_id=$1",[f.dept])).rows[0].count,20);
  });
  await check("trailer worker RPC and private helper permissions are explicit", async () => {
    for(const actor of [f.lead,f.member,f.otherLead]) await asUser(actor,() => assert.rejects(() => q("select record_trailer_gate($1,'{}',true,now())",[main]),denied));
    await db.exec("set role anon");
    try { await assert.rejects(() => q("select record_trailer_gate($1,'{}',true,now())",[main]),denied); } finally { await db.exec("reset role"); }
    const functions=["trailer_candidates(uuid)","create_trailer_draft(uuid,uuid[],text[],text,jsonb)","regenerate_trailer(uuid)","update_trailer_scenarios(uuid,jsonb,timestamp with time zone)","request_trailer_recheck(uuid)","approve_trailer_items(uuid,text[])","delete_trailer(uuid)"];
    for(const signature of functions) for(const role of ["anon","authenticated","service_role"]) assert.equal((await q("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed,role==="authenticated");
    for(const role of ["anon","authenticated","service_role"]) {
      assert.equal((await q("select has_function_privilege($1,'record_trailer_gate(uuid,jsonb,boolean,timestamp with time zone)','EXECUTE') allowed",[role])).rows[0].allowed,role==="service_role");
      assert.equal((await q("select has_schema_privilege($1,'private','USAGE') allowed",[role])).rows[0].allowed,false);
      for(const table of ["trailers","trailer_generation_counters"]) for(const command of ["INSERT","UPDATE","DELETE"]) assert.equal((await q("select has_table_privilege($1,$2,$3) allowed",[role,table,command])).rows[0].allowed,role==="service_role");
    }
  });
  await check("scenario trigger assigns org, protects identity, resets hashes and matches SQL approval golden IDs", async () => {
    await generated(main);
    let t=await get(main);
    assert.equal(t.org_id,ids.org); assert.equal(t.scenarios_hash.length,64);
    assert.equal(t.gate_passed_hash,null); assert.equal(t.approval_hash,null);
    assert.deepEqual((await q("select private.trailer_approval_item_ids($1::jsonb) ids",[JSON.stringify(fixture.scenarios)])).rows[0].ids,fixture.expected_item_ids);
    await service(() => assert.rejects(() => q("update trailers set dept_id=$2 where id=$1",[main,f.otherDept]),denied));
    assert.equal(await gate(main),"recorded");
    await asUser(f.lead,async () => { const result=(await q("select approve_trailer_items($1,$2::text[]) result",[main,fixture.expected_item_ids])).rows[0].result; assert.equal(result.complete,true); });
    t=await get(main); assert.equal(t.scenarios_hash,t.approval_hash); assert.equal(t.scenarios_hash,t.gate_passed_hash);
    await asUser(f.lead,async () => { const result=(await q("select approve_trailer_items($1,$2::text[]) result",[main,fixture.expected_item_ids.slice(1)])).rows[0].result; assert.equal(result.complete,false); });
    assert.equal((await get(main)).approval_hash,null);
    await service(() => q("update trailers set scenarios=jsonb_set(scenarios,'{0,title}','\"다른 합성 제목\"') where id=$1",[main]));
    t=await get(main); assert.equal(t.gate_passed_hash,null); assert.equal(t.approval_hash,null); assert.deepEqual(t.approved_item_ids,[]);
  });
  await check("gate reports reject raw excerpts and stale results never mutate trailers", async () => {
    await generated(main);
    const t=await get(main);
    assert.equal(await gate(main,true,"2000-01-01T00:00:00Z"),"stale");
    assert.deepEqual(await get(main),t);
    await service(() => assert.rejects(() => q("select record_trailer_gate($1,$2::jsonb,true,$3)",[main,JSON.stringify({passed:true,violations:[],excerpt:"must not persist"}),t.updated_at]),rejection("invalid_gate_report")));
    assert.equal(await gate(main,false),"recorded"); assert.equal((await get(main)).gate_passed_hash,null);
    await asUser(f.lead,() => q("select request_trailer_recheck($1)",[main]));
    assert.equal(await gate(main),"recorded");
  });
  await check("trailer updates require the current version and reset approvals, with lead-only reads", async () => {
    let t=await get(main);
    const changed=structuredClone(fixture.scenarios); changed[0].summary="새로 확인한 가상 요약입니다.";
    await asUser(f.lead,async () => {
      await assert.rejects(() => q("select update_trailer_scenarios($1,$2::jsonb,$3)",[main,JSON.stringify(changed),"2000-01-01"]),rejection("trailer_stale"));
      await q("select update_trailer_scenarios($1,$2::jsonb,$3)",[main,JSON.stringify(changed),t.updated_at]);
      assert.equal((await q("select count(*)::int n from trailers where id=$1",[main])).rows[0].n,1);
    });
    t=await get(main); assert.equal(t.status,"checking"); assert.equal(t.approval_hash,null); assert.equal(t.gate_passed_hash,null);
    for(const actor of [f.member,f.otherLead]) await asUser(actor,async () => { assert.equal((await q("select count(*)::int n from trailers where id=$1",[main])).rows[0].n,0); });
    await q("insert into trailers(dept_id,org_id,source_decision_ids,rubric) values($1,$2,$3::uuid[],$4::jsonb)",[f.demoDept,ids.org,`{${f.decision}}`,rubric]);
    await db.exec("set role anon"); try { const rows=(await q("select dept_id from trailers")).rows; assert.equal(rows.length,1); assert.equal(rows[0].dept_id,f.demoDept); } finally { await db.exec("reset role"); }
  });
  const approve = () => asUser(f.lead,() => q("select approve_trailer_items($1,$2::text[])",[main,fixture.expected_item_ids]));
  const publicRead = async (slug) => {
    await db.exec("set role anon");
    try { return (await q("select public_trailer($1) result",[slug])).rows[0].result; } finally { await db.exec("reset role"); }
  };
  let slug;
  await check("publication requires organization permission, passing gate and complete current approval", async () => {
    await gate(main);
    await approve();
    await asUser(f.lead,() => assert.rejects(() => q("select publish_trailer($1)",[main]),rejection("trailer_publishing_disabled")));
    await asUser(adminIds.adminA,() => q("select admin_set_trailer_publishing(true)"));
    await generated(main);
    await gate(main,false);
    await asUser(f.lead,() => assert.rejects(() => q("select publish_trailer($1)",[main]),rejection("trailer_gate_not_passed")));
    await asUser(f.lead,() => q("select request_trailer_recheck($1)",[main]));
    await gate(main);
    await asUser(f.lead,() => assert.rejects(() => q("select publish_trailer($1)",[main]),rejection("trailer_not_approved")));
    await approve();
    await asUser(f.lead,async () => {
      slug=(await q("select publish_trailer($1) slug",[main])).rows[0].slug;
      assert.match(slug,/^[a-z0-9]{22}$/);
      assert.equal((await q("select publish_trailer($1) slug",[main])).rows[0].slug,slug);
      await assert.rejects(() => q("select update_trailer_scenarios($1,$2::jsonb,now())",[main,JSON.stringify(fixture.scenarios)]),rejection("trailer_state_invalid"));
    });
    const result=await publicRead(slug); assert.deepEqual(Object.keys(result).sort(),["apply_url","scenarios"]);
  });
  await check("published scenario edits immediately stop public reads and unsupported schema is explicit", async () => {
    await service(() => q("update trailers set schema_version=2 where id=$1",[main]));
    await assert.rejects(() => publicRead(slug),rejection("trailer_schema_unsupported"));
    await service(() => q("update trailers set schema_version=1,scenarios=jsonb_set(scenarios,'{0,title}','\"다시 수정한 제목\"') where id=$1",[main]));
    assert.equal(await publicRead(slug),null);
    const t=await get(main); assert.equal(t.approval_hash,null); assert.equal(t.gate_passed_hash,null);
  });
  await check("unpublishing invalidates the old slug and republishing issues a new one", async () => {
    await asUser(f.lead,() => q("select unpublish_trailer($1)",[main]));
    assert.equal(await publicRead(slug),null); assert.equal((await get(main)).slug,null);
    const t=await get(main);
    await asUser(f.lead,() => q("select update_trailer_scenarios($1,$2::jsonb,$3)",[main,JSON.stringify(fixture.scenarios),t.updated_at]));
    await gate(main); await approve();
    const old=slug;
    await asUser(f.lead,async () => { slug=(await q("select publish_trailer($1) slug",[main])).rows[0].slug; });
    assert.notEqual(slug,old); assert.equal(await publicRead(old),null);
    await asUser(adminIds.adminA,async () => {
      const overview=(await q("select admin_overview() result")).rows[0].result;
      assert.equal(overview.trailer_publish_enabled,true);
      assert.deepEqual(Object.keys(overview.published_trailers[0]).sort(),["dept_name","public_path","published_at","title","trailer_id"]);
    });
  });
  await check("only organization admins toggle publication and cannot unpublish another organization", async () => {
    for(const actor of [f.member,f.lead]) await asUser(actor,() => assert.rejects(() => q("select admin_set_trailer_publishing(true)"),denied));
    await asUser(adminIds.adminB,() => assert.rejects(() => q("select admin_unpublish_trailer($1)",[main]),denied));
    await asUser(adminIds.adminA,() => q("select admin_unpublish_trailer($1)",[main]));
    assert.equal(await publicRead(slug),null);
    await generated(main); await gate(main); await approve();
    await asUser(f.lead,async () => { slug=(await q("select publish_trailer($1) slug",[main])).rows[0].slug; });
    await asUser(adminIds.adminA,() => q("select admin_set_trailer_publishing(false)"));
    assert.equal(await publicRead(slug),null); assert.equal((await get(main)).status,"unpublished");
    assert.equal((await q("select count(*)::int n from admin_events where action='trailer_publishing_toggle'")).rows[0].n,2);
    for(const signature of ["publish_trailer(uuid)","unpublish_trailer(uuid)","admin_set_trailer_publishing(boolean)","admin_unpublish_trailer(uuid)","public_trailer(text)"]) {
      for(const role of ["anon","authenticated","service_role"]) assert.equal((await q("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed,role==="authenticated" || (role==="anon" && signature==="public_trailer(text)"));
    }
  });
  await check("trailer regeneration and deletion enforce state and keep the daily limit", async () => {
    await asUser(f.lead,() => assert.rejects(() => q("select regenerate_trailer($1)",[main]),rejection("trailer_state_invalid")));
    await q("update trailers set status='failed' where id=$1",[main]);
    await asUser(f.lead,() => assert.rejects(() => q("select regenerate_trailer($1)",[main]),rejection("trailer_daily_limit")));
    await q("delete from trailer_generation_counters where dept_id=$1",[f.dept]);
    await asUser(f.lead,() => q("select regenerate_trailer($1)",[main]));
    assert.equal((await get(main)).status,"generating");
    await asUser(f.lead,() => assert.rejects(() => q("select delete_trailer($1)",[main]),rejection("trailer_state_invalid")));
    await q("update trailers set status='failed' where id=$1",[main]);
    await asUser(f.lead,() => q("select delete_trailer($1)",[main]));
    assert.equal(await get(main),undefined);
  });
  return { fixture, f, main, service, get, gate, generated, rejection, denied, rubric };
}
