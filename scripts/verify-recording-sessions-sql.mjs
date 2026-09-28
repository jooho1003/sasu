import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function verifyRecordingSessionsSql({ db, q, check, asUser }) {
  const ids = Object.fromEntries(["org", "dept", "other", "lead", "lead2", "member", "outsider", "admin", "unconsented"].map(key => [key, randomUUID()]));
  await q("insert into orgs(id,name) values($1,'Recording session QA')", [ids.org]);
  await q("insert into departments(id,org_id,name) values($1,$3,'Recording'),($2,$3,'Other')", [ids.dept, ids.other, ids.org]);
  for (const key of ["lead", "lead2", "member", "outsider", "admin", "unconsented"]) await q("insert into auth.users(id) values($1)", [ids[key]]);
  await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$6,'lead','Lead',now()),($2,$6,'lead','Lead two',now()),($3,$6,'member','Member',now()),($4,$7,'lead','Outsider',now()),($5,$6,'member','Unconsented',null)", [ids.lead, ids.lead2, ids.member, ids.outsider, ids.unconsented, ids.dept, ids.other]);
  await q("insert into org_admins(org_id,user_id,granted_by) values($1,$2,'qa')", [ids.org, ids.admin]);
  const input = (id = randomUUID(), changes = {}) => ({ id, title: "합성 회의 qa@example.com", input_method: "microphone", visibility: "leads_only", meeting_provider: "in_person", participants: [ids.member], consent_confirmed: true, ...changes });
  const start = (value, dept = ids.dept, version = 1) => q("select start_review_recording($1,$2::jsonb,$3) value", [dept, JSON.stringify(value), version]);
  const key = (id, dept = ids.dept) => q("select recording_key_context($1,$2) value", [dept, id]);
  const discard = id => q("select discard_review_recording($1,$2) value", [ids.dept, id]);
  const rejects = (fn, code) => assert.rejects(fn, error => error.code === code);
  const allClosed = () => q("update review_recordings set state='discarded' where dept_id=any($1::uuid[]) and state in ('active','saving')", [[ids.dept, ids.other]]);
  let rid;

  await check("recording sessions: start requires opt-in, lead consent and same-department participants", async () => {
    await asUser(ids.lead, () => rejects(() => start(input()), "42501"));
    await asUser(ids.admin, () => q("select admin_set_review_settings(true,false)"));
    for (const actor of [ids.member, ids.admin, ids.outsider, ids.unconsented]) await asUser(actor, () => rejects(() => start(input()), "42501"));
    await asUser(ids.lead, async () => {
      for (const participant of [ids.outsider, ids.unconsented, randomUUID()]) await rejects(() => start(input(undefined, { participants: [participant] })), "42501");
    });
  });
  await check("recording sessions: direct RPC rejects missing/extra fields and invalid types", () => asUser(ids.lead, async () => {
    for (const patch of [{ dept_id: ids.other }, { created_by: ids.admin }, { key_version: 2 }, { consent_confirmed: "true" }, { consent_confirmed: false }, { participants: null }, { participants: [1] }, { participants: [ids.member, ids.member] }, { title: null }, { title: " " }, { title: "a".repeat(121) }, { id: "bad" }, { visibility: "public" }, { meeting_provider: "https://example.com" }, { input_method: "upload" }, { audio: "bytes" }, { state: "completed" }]) {
      await rejects(() => start(input(undefined, patch)), "22023");
    }
    await rejects(() => start(null), "22023");
    const missing = input(); delete missing.consent_confirmed;
    await rejects(() => start(missing), "22023");
    await rejects(() => start(input(), ids.dept, 0), "22023");
  }));
  await check("recording sessions: metadata only, recorder auto-included, masked title, server snapshot and expiry", async () => {
    rid = randomUUID();
    const before = (await q("select count(*)::int n from jobs")).rows[0].n;
    await asUser(ids.lead, async () => {
      const result = (await start(input(rid))).rows[0].value;
      assert.equal(result.id, rid); assert.equal(result.state, "active"); assert.equal(result.key_version, 1);
      const row = (await q("select * from review_recordings where id=$1", [rid])).rows[0];
      assert.equal(row.title, "합성 회의 [이메일]");
      assert.deepEqual([...row.participants].sort(), [ids.lead, ids.member].sort());
      assert.equal(row.consent_confirmed_by, ids.lead);
      assert.equal(row.consent_snapshot.length, 2);
      assert.ok(row.consent_snapshot.every(person => person.consented_at && !person.email));
      assert.equal(new Date(row.expires_at)-new Date(row.started_at), 86400000);
      assert.deepEqual((await key(rid)).rows[0].value, { recording_id: rid, user_id: ids.lead, dept_id: ids.dept, key_version: 1 });
    });
    assert.equal((await q("select count(*)::int n from jobs")).rows[0].n, before);
    assert.equal((await q("select count(*)::int n from reviewed_materials where id=$1", [rid])).rows[0].n, 0);
    assert.equal((await q("select count(*)::int n from storage.objects where name like $1", [`%/${rid}/%`])).rows[0].n, 0);
  });
  await check("recording sessions: retry preserves ID/snapshot/expiry/key version; changed input conflicts", async () => {
    const original = (await q("select * from review_recordings where id=$1", [rid])).rows[0];
    await asUser(ids.lead, async () => {
      assert.equal((await start(input(rid), ids.dept, 2)).rows[0].value.key_version, 1);
      await rejects(() => start(input(rid, { title: "다른 제목" })), "40001");
      await rejects(() => start(input(rid, { participants: [] })), "40001");
    });
    await asUser(ids.lead2, () => rejects(() => start(input(rid)), "40001"));
    assert.deepEqual((await q("select * from review_recordings where id=$1", [rid])).rows[0], original);
  });
  await check("recording sessions: RLS and key deny other leads, members, departments and contentless admins", async () => {
    for (const actor of [ids.lead2, ids.member, ids.outsider, ids.admin]) await asUser(actor, async () => {
      assert.equal((await q("select * from review_recordings where id=$1", [rid])).rows.length, 0);
      assert.deepEqual((await q("select list_review_recordings($1) value", [ids.dept])).rows[0].value, []);
      await rejects(() => key(rid), actor===ids.lead2 ? "P0002" : "42501");
      await rejects(() => discard(rid), actor===ids.lead2 ? "P0002" : "42501");
    });
    await asUser(ids.lead, () => rejects(() => key(rid, ids.other), "42501"));
    await asUser(ids.admin, async () => assert.equal((await q("select admin_review_recording_count() n")).rows[0].n, 1));
    await asUser(ids.lead, () => rejects(() => q("select admin_review_recording_count()"), "42501"));
  });
  await check("recording sessions: direct INSERT/UPDATE/DELETE and key version edits are forbidden", () => asUser(ids.lead, async () => {
    await rejects(() => q("update review_recordings set key_version=2 where id=$1", [rid]), "42501");
    await rejects(() => q("delete from review_recordings where id=$1", [rid]), "42501");
    await rejects(() => q("insert into review_recordings select * from review_recordings where id=$1", [rid]), "42501");
  }));
  await check("recording sessions: switch off blocks start/key but permits listing and idempotent discard", async () => {
    await asUser(ids.admin, () => q("select admin_set_review_settings(false,false)"));
    await asUser(ids.lead, async () => {
      await rejects(() => start(input()), "42501"); await rejects(() => key(rid), "42501");
      assert.equal((await q("select list_review_recordings($1,$2) value", [ids.dept, rid])).rows[0].value.length, 1);
      for (let i=0;i<2;i++) assert.equal((await discard(rid)).rows[0].value.state, "discarded");
    });
    await asUser(ids.admin, () => q("select admin_set_review_settings(true,false)"));
    await asUser(ids.lead, async () => { await rejects(() => key(rid), "P0002"); await rejects(() => start(input(rid)), "55000"); });
  });
  await check("recording sessions: user quota is three across departments; retry is not charged twice", async () => {
    await allClosed();
    await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$2,'lead','Lead',now())", [ids.lead, ids.other]);
    const values = [input(), input(), input(undefined, { participants: [] })];
    await asUser(ids.lead, async () => {
      await start(values[0]); await start(values[1]); await start(values[2], ids.other);
      await start(values[0]);
      await rejects(() => start(input()), "54000");
      await discard(values[0].id);
      await start(input());
    });
    await allClosed();
  });
  await check("recording sessions: department quota is ten across recorders", async () => {
    const actors = [];
    for (let i=0;i<4;i++) {
      const user = randomUUID(); actors.push(user);
      await q("insert into auth.users(id) values($1)", [user]);
      await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$2,'lead','Quota',now())", [user, ids.dept]);
    }
    for (let i=0;i<10;i++) await asUser(actors[Math.floor(i/3)], () => start(input()));
    await asUser(actors[3], () => rejects(() => start(input()), "54000"));
    await allClosed();
  });
  await check("recording sessions: expired sessions fail before sweep and do not consume quota", async () => {
    const value = input();
    await asUser(ids.lead, () => start(value));
    await q("update review_recordings set started_at=now()-interval '25 hours',expires_at=now()-interval '1 hour' where id=$1", [value.id]);
    await asUser(ids.lead, async () => {
      await rejects(() => key(value.id), "P0002"); await rejects(() => start(value), "55000");
      assert.equal((await q("select list_review_recordings($1,$2) value", [ids.dept, value.id])).rows[0].value[0].state, "expired");
      for (let i=0;i<3;i++) await start(input());
      await rejects(() => q("select sweep_review_recordings()"), "42501");
    });
    await db.exec("set role service_role");
    try { assert.ok((await q("select sweep_review_recordings() n")).rows[0].n>=1); assert.equal((await q("select sweep_review_recordings() n")).rows[0].n, 0); }
    finally { await db.exec("reset role"); }
    assert.equal((await q("select state from review_recordings where id=$1", [value.id])).rows[0].state, "expired");
    await allClosed();
  });
  await check("recording sessions: consent withdrawal and later re-consent cannot resurrect keys", async () => {
    const value = input(); await asUser(ids.lead, () => start(value));
    await q("update members set consented_at=null where dept_id=$1 and user_id=$2", [ids.dept, ids.member]);
    assert.equal((await q("select state from review_recordings where id=$1", [value.id])).rows[0].state, "revoked");
    await q("update members set consented_at=now() where dept_id=$1 and user_id=$2", [ids.dept, ids.member]);
    await asUser(ids.lead, async () => { await rejects(() => key(value.id), "P0002"); await rejects(() => start(value), "55000"); });
  });
  await check("recording sessions: participant removal revokes while lead demotion immediately denies without rewriting state", async () => {
    const value = input(undefined, { participants: [ids.lead2] }); await asUser(ids.lead, () => start(value));
    await q("update members set role='member' where dept_id=$1 and user_id=$2", [ids.dept, ids.lead]);
    await asUser(ids.lead, async () => { await rejects(() => key(value.id), "42501"); assert.equal((await q("select * from review_recordings where id=$1", [value.id])).rows.length, 0); });
    assert.equal((await q("select state from review_recordings where id=$1", [value.id])).rows[0].state, "active");
    await q("update members set role='lead' where dept_id=$1 and user_id=$2", [ids.dept, ids.lead]);
    await q("delete from members where dept_id=$1 and user_id=$2", [ids.dept, ids.lead2]);
    await asUser(ids.lead, () => rejects(() => key(value.id), "P0002"));
  });
  await check("recording sessions: completed sessions cannot obtain a key or be reopened/discarded as local-only", async () => {
    const value = input(); await asUser(ids.lead, () => start(value));
    await q("update review_recordings set state='completed' where id=$1", [value.id]);
    await asUser(ids.lead, async () => { await rejects(() => key(value.id), "P0002"); await rejects(() => start(value), "55000"); await rejects(() => discard(value.id), "55000"); });
  });
  await check("recording sessions: reviewer write guard and explicit API function grants are preserved", async () => {
    const reviewer = "99999999-9999-4999-8999-999999999991";
    await q("insert into auth.users(id) values($1) on conflict do nothing", [reviewer]);
    await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$2,'lead','Reviewer',now())", [reviewer, ids.dept]);
    await asUser(reviewer, () => rejects(() => start(input()), "42501"));
    for (const role of ["anon", "service_role"]) {
      for (const fn of ["start_review_recording(uuid,jsonb,integer)", "recording_key_context(uuid,uuid)", "discard_review_recording(uuid,uuid)", "list_review_recordings(uuid,uuid)", "admin_review_recording_count()"])
        assert.equal((await q("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, `public.${fn}`])).rows[0].allowed, false);
    }
    for (const role of ["anon", "authenticated", "service_role"])
      assert.equal((await q("select has_function_privilege($1,'private.revoke_participant_recordings()','EXECUTE') allowed", [role])).rows[0].allowed, false);
  });
}
