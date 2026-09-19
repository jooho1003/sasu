import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function verifyReviewAccessSql({ db, q, check, asUser }) {
  const ids = Object.fromEntries(["org", "dept", "other", "otherOrg", "foreignDept", "lead", "member", "outsider", "admin", "foreignAdmin", "audio", "document"].map(key => [key, randomUUID()]));
  await q("insert into orgs(id,name) values($1,'Access QA'),($2,'Other Access QA')", [ids.org, ids.otherOrg]);
  await q("insert into departments(id,org_id,name) values($1,$4,'Access'),($2,$4,'Other'),($3,$5,'Foreign')", [ids.dept, ids.other, ids.foreignDept, ids.org, ids.otherOrg]);
  for (const key of ["lead", "member", "outsider", "admin", "foreignAdmin"]) await q("insert into auth.users(id) values($1)", [ids[key]]);
  await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$4,'lead','Lead',now()),($2,$4,'member','Member',now()),($3,$5,'lead','Other',now())", [ids.lead, ids.member, ids.outsider, ids.dept, ids.other]);
  await q("insert into org_admins(org_id,user_id,granted_by) values($1,$2,'qa'),($3,$4,'qa')", [ids.org, ids.admin, ids.otherOrg, ids.foreignAdmin]);
  async function create(id, kind = "audio") {
    await asUser(ids.lead, () => q("select create_review($1,$2::jsonb)", [ids.dept, JSON.stringify({ id, kind, title: "합성 자료", filename: kind === "audio" ? "qa.wav" : "qa.txt", size: 100, fingerprint: "b".repeat(64), duration: kind === "audio" ? 30 : null, visibility: "dept", participants: [], synthetic: true, consent_confirmed: true })]));
    await q("insert into storage.objects(bucket_id,name) values('review-materials',$1)", [`${ids.dept}/${id}/original`]);
  }
  await create(ids.audio); await create(ids.document, "document");
  const access = (id = ids.audio, action = "play_original", dept = ids.dept) => q("select authorize_review_access($1,$2,$3) value", [dept, id, action]);
  async function issue(id = ids.audio, action = "play_original") {
    let result;
    await asUser(ids.lead, async () => { result = (await access(id, action)).rows[0].value; });
    return result;
  }
  async function read(grant, user = ids.lead, operation = "storage.object.get_authenticated", path = grant.path) {
    let result;
    await asUser(user, async () => {
      await q("select set_config('request.headers',$1,false),set_config('storage.operation',$2,false)", [JSON.stringify({ "x-sasu-review-access": grant.token }), operation]);
      try { result = (await q("select name from storage.objects where bucket_id='review-materials' and name=$1", [path])).rows; }
      finally { await q("select set_config('request.headers','{}',false),set_config('storage.operation','',false)"); }
    });
    return result;
  }
  const settings = (enabled) => asUser(ids.admin, () => q("select admin_set_review_settings(false,$1)", [enabled]));
  const rejects = (fn, code) => assert.rejects(fn, error => error.code === code);

  await check("review access: default off, only own org admin can change settings, metadata audit written", async () => {
    await asUser(ids.lead, async () => {
      assert.deepEqual((await q("select review_org_settings($1) value", [ids.dept])).rows[0].value, { browser_recording_enabled: false, allow_original_download: false });
      await rejects(() => q("select admin_set_review_settings(true,true)"), "42501");
    });
    await settings(true);
    assert.equal((await q("select count(*)::int n from admin_events where org_id=$1 and action='review_settings_update'", [ids.org])).rows[0].n, 1);
    await asUser(ids.foreignAdmin, () => q("select admin_set_review_settings(true,true)"));
    assert.equal((await q("select browser_recording_enabled from org_settings where org_id=$1", [ids.org])).rows[0].browser_recording_enabled, false);
    await settings(false);
  });
  await check("review access: member, other department, contentless admin, and wrong dept cannot issue", async () => {
    for (const actor of [ids.member, ids.outsider, ids.admin]) await asUser(actor, () => rejects(() => access(), "42501"));
    await asUser(ids.lead, () => rejects(() => access(ids.audio, "play_original", ids.other), "42501"));
  });
  await check("review access: download off blocks audio and documents; play cannot disguise a document", async () => {
    await asUser(ids.lead, async () => {
      await rejects(() => access(ids.document, "download_original"), "42501");
      await rejects(() => access(ids.audio, "download_original"), "42501");
      await rejects(() => access(ids.document, "play_original"), "22023");
    });
  });
  await check("review access: actual Storage RLS rejects ungranted direct SELECT and private ticket reads", async () => {
    assert.equal((await read({ token: "invalid", path: `${ids.dept}/${ids.audio}/original` })).length, 0);
    await asUser(ids.lead, () => rejects(() => q("select * from private.review_access_tickets"), "42501"));
  });
  await check("review access: INSERT-only upload remains allowed; permissive SELECT cannot bypass restrictive guard", async () => {
    const upload = randomUUID();
    await asUser(ids.lead, () => q("insert into storage.objects(id,bucket_id,name) values($1,'review-materials',$2)", [upload, `${ids.dept}/${ids.audio}/parts/0.wav`]));
    await asUser(ids.member, () => rejects(() => q("insert into storage.objects(bucket_id,name) values('review-materials',$1)", [`${ids.dept}/${ids.audio}/parts/0.wav`]), "42501"));
    await q("create policy qa_permissive_read on storage.objects for select to authenticated using(true)");
    try { assert.equal((await read({ token: "invalid", path: `${ids.dept}/${ids.audio}/original` })).length, 0); }
    finally { await q("drop policy qa_permissive_read on storage.objects"); }
  });
  await check("review access: one event and one successful Storage transaction, replay denied", async () => {
    const before = (await q("select count(*)::int n from review_access_events where actor_id=$1", [ids.lead])).rows[0].n;
    const grant = await issue();
    assert.equal((await read(grant)).length, 1);
    assert.equal((await read(grant)).length, 0);
    assert.equal((await q("select count(*)::int n from review_access_events where actor_id=$1", [ids.lead])).rows[0].n, before + 1);
  });
  await check("review access: signed URL/list/copy cannot use an issued ticket", async () => {
    const grant = await issue();
    for (const op of ["storage.object.sign", "storage.object.sign_many", "storage.object.list", "storage.object.copy", ""]) assert.equal((await read(grant, ids.lead, op)).length, 0);
    assert.equal((await read(grant)).length, 1);
  });
  await check("review access: ticket is bound to actor and exact original path; bad attempts do not consume it", async () => {
    const grant = await issue();
    assert.equal((await read(grant, ids.outsider)).length, 0);
    assert.equal((await read(grant, ids.lead, "storage.object.get_authenticated", `${ids.dept}/${ids.document}/original`)).length, 0);
    assert.equal((await read(grant)).length, 1);
  });
  await check("review access: expiry, membership downgrade, and switch changes fence previously issued tickets", async () => {
    const expired = await issue();
    await q("update private.review_access_tickets set expires_at=now()-interval '1 second' where token=$1", [expired.token]);
    assert.equal((await read(expired)).length, 0);
    const downgraded = await issue();
    await q("update members set role='member' where user_id=$1 and dept_id=$2", [ids.lead, ids.dept]);
    assert.equal((await read(downgraded)).length, 0);
    await q("update members set role='lead' where user_id=$1 and dept_id=$2", [ids.lead, ids.dept]);
    await settings(true);
    const download = await issue(ids.document, "download_original");
    await settings(false);
    assert.equal((await read(download)).length, 0);
  });
  await check("review access: download enabled permits original document through Storage RLS", async () => {
    await settings(true);
    assert.equal((await read(await issue(ids.document, "download_original"))).length, 1);
  });
  await check("review access: append-only, org metadata scope, and no content in audit RPC", async () => {
    await asUser(ids.lead, async () => {
      await rejects(() => q("insert into review_access_events(review_id,dept_id,actor_id,action) values($1,$2,$3,'export')", [ids.audio,ids.dept,ids.lead]), "42501");
      await rejects(() => q("update review_access_events set action='export'"), "42501");
      await rejects(() => q("delete from review_access_events"), "42501");
    });
    for (const actor of [ids.member, ids.outsider, ids.foreignAdmin]) await asUser(actor, async () => assert.equal((await q("select * from review_access_events where dept_id=$1", [ids.dept])).rows.length, 0));
    await asUser(ids.admin, async () => {
      const records = (await q("select admin_review_access_events(100) value")).rows[0].value;
      assert.ok(records.length > 0);
      assert.deepEqual(Object.keys(records[0]).sort(), ["id","review_id","dept_id","actor_id","action","created_at"].sort());
      assert.equal((await q("select * from reviewed_materials where dept_id=$1", [ids.dept])).rows.length, 0);
    });
  });
  await check("review access: rolling minute actor limit denies issuance 61, failed delivery is counted", async () => {
    await q("update review_access_events set created_at=now()-interval '2 minutes' where actor_id=$1", [ids.lead]);
    await asUser(ids.lead, async () => {
      for (let n=0;n<60;n++) await access();
      await assert.rejects(() => access(), error => error.code === "P0001" && error.message === "rate_limited");
    });
    await q("update review_access_events set created_at=now()-interval '2 minutes' where actor_id=$1", [ids.lead]);
  });
  await check("review retention: consenting lead only; null/30/90/365 settings preserve Slack retention", async () => {
    await asUser(ids.admin, () => rejects(() => q("select set_review_original_retention($1,30)", [ids.dept]), "42501"));
    await asUser(ids.lead, async () => {
      await q("select set_retention_settings($1,'paid',null,365)", [ids.dept]);
      await rejects(() => q("select set_review_original_retention($1,7)", [ids.dept]), "22023");
      await q("select set_review_original_retention($1,30)", [ids.dept]);
    });
    assert.equal((await q("select retention_days from retention_settings where dept_id=$1", [ids.dept])).rows[0].retention_days, 365);
  });
  await check("review retention: pre-sweep expiry denies access, reextract, queue and late worker completion", async () => {
    const grant = await issue();
    await q("update reviewed_materials set status='ready',sections='[{\"id\":\"s\",\"text\":\"보존할 전사\",\"origin\":\"transcribed\",\"edited\":false}]' where id=$1", [ids.audio]);
    await q("update review_parts set status='done' where review_id=$1", [ids.audio]);
    await q("insert into review_revisions(review_id,revision,title,sections,edited_by) select id,revision,title,sections,created_by from reviewed_materials where id=$1", [ids.audio]);
    await asUser(ids.lead, () => q("select publish_review($1,1)", [ids.audio]));
    const part = (await q("select id from review_parts where review_id=$1", [ids.audio])).rows[0].id;
    const lease = randomUUID();
    await q("update review_parts set status='processing',lease=$2,lease_until=now()+interval '1 minute' where id=$1", [part,lease]);
    await q("update reviewed_materials set confirmed_at=now()-interval '31 days',sections='[{\"id\":\"s\",\"text\":\"보존할 전사\"}]',status='processing' where id=$1", [ids.audio]);
    assert.equal((await read(grant)).length, 0);
    await asUser(ids.lead, async () => {
      await rejects(() => access(), "P0002");
      await rejects(() => q("select review_action($1,1,'reextract')", [ids.audio]), "P0002");
      await rejects(() => q("select queue_review_part($1,0)", [ids.audio]), "P0002");
    });
    assert.equal((await q("select finish_review_part($1,$2,'[]',null) value", [part,lease])).rows[0].value, false);
    assert.equal((await q("select claim_review_part($1,0,$2) value", [part,lease])).rows[0].value, null);
  });
  await check("review retention: sweep schedules once, keeps transcript/revisions, cancels leases; export survives", async () => {
    const prior = (await q("select sections from reviewed_materials where id=$1", [ids.audio])).rows[0].sections;
    await asUser(ids.lead, () => rejects(() => q("select sweep_review_originals()"), "42501"));
    await q("select sweep_review_originals()"); await q("select sweep_review_originals()");
    const row = (await q("select original_deleted_at,sections from reviewed_materials where id=$1", [ids.audio])).rows[0];
    assert.ok(row.original_deleted_at); assert.deepEqual(row.sections, prior);
    assert.equal((await q("select count(*)::int n from review_revisions where review_id=$1", [ids.audio])).rows[0].n, 1);
    assert.equal((await q("select s.active from sources s join reviewed_materials r on r.published_source_id=s.id where r.id=$1", [ids.audio])).rows[0].active, true);
    assert.equal((await q("select i.content from items i join reviewed_materials r on r.published_source_id=i.source_id where r.id=$1", [ids.audio])).rows[0].content, "보존할 전사");
    assert.equal((await q("select count(*)::int n from jobs where kind='purge_review_files' and payload->>'reviewId'=$1", [ids.audio])).rows[0].n, 1);
    assert.equal((await q("select count(*)::int n from review_parts where review_id=$1 and lease is not null", [ids.audio])).rows[0].n, 0);
    await asUser(ids.lead, () => access(ids.audio, "export"));
  });
  await check("review retention: manual and unconfirmed originals are never scheduled", async () => {
    assert.equal((await q("select original_deleted_at from reviewed_materials where id=$1", [ids.document])).rows[0].original_deleted_at, null);
    await asUser(ids.lead, () => q("select set_review_original_retention($1,null)", [ids.dept]));
    await q("update reviewed_materials set confirmed_at=now()-interval '400 days' where id=$1", [ids.document]);
    await q("select sweep_review_originals()");
    assert.equal((await q("select original_deleted_at from reviewed_materials where id=$1", [ids.document])).rows[0].original_deleted_at, null);
  });
  await check("review access: reviewer hard stop covers new public tables and old RPC aliases are private", async () => {
    for (const name of ["org_settings", "review_access_events"]) assert.equal((await q("select count(*)::int n from pg_trigger where tgrelid=$1::regclass and tgname='demo_reviewer_read_only'", [name])).rows[0].n, 1);
    await asUser(ids.lead, async () => {
      await rejects(() => q("select review_action_before_access_controls($1,1,'reextract')", [ids.document]), "42501");
      await rejects(() => q("select queue_review_part_before_access_controls($1,0)", [ids.document]), "42501");
    });
    // Direct mutation from a reviewer identity is rejected even through SECURITY DEFINER.
    await asUser("99999999-9999-4999-8999-999999999991", () => rejects(() => q("select admin_set_review_settings(true,true)"), "42501"));
  });
  // Leave no custom request context for other harness suites.
  await db.exec("reset role");
}
