import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

// step1-C (ADR-070): save → segment upload → verification → one completion →
// windows → per-segment access → purge scheduling. Isolated PGlite; the fake
// storage.objects table has the real RLS policies but no Storage server.
export async function verifyRecordingSegmentsSql({ db, q, check, asUser }) {
  const ids = Object.fromEntries(["org", "dept", "other", "lead", "lead2", "member", "member2", "outsider", "admin"].map(key => [key, randomUUID()]));
  await q("insert into orgs(id,name) values($1,'Recording segments QA')", [ids.org]);
  await q("insert into departments(id,org_id,name) values($1,$3,'Segments'),($2,$3,'Segments other')", [ids.dept, ids.other, ids.org]);
  for (const key of ["lead", "lead2", "member", "member2", "outsider", "admin"]) await q("insert into auth.users(id) values($1)", [ids[key]]);
  await q(`insert into members(user_id,dept_id,role,display_name,consented_at) values
    ($1,$6,'lead','Recorder',now()),($2,$6,'lead','Lead two',now()),($3,$6,'member','Member',now()),($4,$6,'member','Member two',now()),($5,$7,'lead','Outsider',now())`,
  [ids.lead, ids.lead2, ids.member, ids.member2, ids.outsider, ids.dept, ids.other]);
  await q("insert into org_admins(org_id,user_id,granted_by) values($1,$2,'qa')", [ids.org, ids.admin]);

  const rejects = (fn, code, message) => assert.rejects(fn, error => error.code === code && (!message || error.message === message));
  async function run(actor, fn) { let out; await asUser(actor, async () => { out = await fn(); }); return out; }
  async function asService(fn) { await db.exec("set role service_role"); try { return await fn(); } finally { await db.exec("reset role"); } }
  const value = result => result.rows[0].value;
  const settings = (recording, download = false) => run(ids.admin, () => q("select admin_set_review_settings($1,$2)", [recording, download]));
  // Fixture hygiene: the 3-per-user and 10-per-department quotas count live sessions,
  // so sessions a check no longer needs are closed directly (not a product path).
  const live = new Set();
  const park = () => q("update review_recordings set state='discarded',state_reason='user_discarded',updated_at=clock_timestamp() where dept_id=$1 and state in ('active','saving') and not (id=any($2::uuid[]))", [ids.dept, [...live]]);

  const sha = seed => createHash("sha256").update(String(seed)).digest("hex");
  const seg = (index, samples, seed = index) => ({ index, sample_count: samples, bytes: 44 + samples * 2, sha256: sha(seed) });
  const manifestOf = (...samples) => ({ version: 1, segments: samples.map((n, index) => seg(index, n)) });
  const total = manifest => manifest.segments.reduce((sum, s) => sum + s.sample_count, 0);
  const captureFor = (manifest, extra = {}) => ({ paused: false, interrupted: false, captured_samples: total(manifest), ...extra });
  const canonical = manifest => "sasu-recording-manifest-v1\n" + manifest.segments.map(s => `${s.index}:${s.sample_count}:${s.bytes}:${s.sha256}\n`).join("");
  const fingerprint = manifest => createHash("sha256").update(canonical(manifest), "utf8").digest("hex");
  const sessionInput = (changes = {}) => ({ id: randomUUID(), title: "합성 회의 qa@example.com", input_method: "microphone", visibility: "leads_only", meeting_provider: "in_person", participants: [ids.member], consent_confirmed: true, ...changes });
  const start = (input, actor = ids.lead) => run(actor, () => q("select start_review_recording($1,$2::jsonb,1) value", [ids.dept, JSON.stringify(input)]));
  const saveRaw = (id, manifestJson, captureJson, actor = ids.lead, dept = ids.dept) =>
    run(actor, async () => value(await q("select create_review_recording($1,$2,$3::jsonb,$4::jsonb) value", [dept, id, manifestJson, captureJson])));
  const save = (id, manifest, capture = captureFor(manifest), actor = ids.lead, dept = ids.dept) => saveRaw(id, JSON.stringify(manifest), JSON.stringify(capture), actor, dept);
  const finalize = (id, actor = ids.lead) => run(actor, async () => value(await q("select finalize_review_recording($1,$2) value", [ids.dept, id])));
  const discard = (id, actor = ids.lead) => run(actor, async () => value(await q("select discard_review_recording($1,$2) value", [ids.dept, id])));
  const key = (id, actor = ids.lead) => run(actor, async () => value(await q("select recording_key_context($1,$2) value", [ids.dept, id])));
  const path = (id, index, attempt = 1) => `${ids.dept}/${id}/original-segments/${index}-${attempt}.wav`;
  const upload = (actor, name) => run(actor, () => q("insert into storage.objects(bucket_id,name) values('review-materials',$1)", [name]));
  const segRow = async (id, index) => (await q("select * from review_original_segments where review_id=$1 and segment_index=$2", [id, index])).rows[0];
  const reviewRow = async id => (await q("select * from reviewed_materials where id=$1", [id])).rows[0];
  const sessionRow = async id => (await q("select * from review_recordings where id=$1", [id])).rows[0];
  const count = async (sql, params) => (await q(sql, params)).rows[0].n;
  async function claim(id, index, attempt, runNo, lease = randomUUID()) {
    return { lease, value: await asService(async () => value(await q("select claim_review_segment($1,$2,$3,$4,$5) value", [id, index, attempt, runNo, lease]))) };
  }
  const finish = (id, index, lease, result) => asService(async () => value(await q("select finish_review_segment($1,$2,$3,$4) value", [id, index, lease, result])));
  async function settle(id, index, result = "verified") {
    const row = await segRow(id, index);
    const claimed = await claim(id, index, row.attempt, row.verify_run);
    assert.ok(claimed.value, `claim ${index}`);
    assert.equal(await finish(id, index, claimed.lease, result), true);
  }
  async function read(actor, token, name, operation = "storage.object.get_authenticated") {
    return run(actor, async () => {
      await q("select set_config('request.headers',$1,false),set_config('storage.operation',$2,false)", [JSON.stringify({ "x-sasu-review-access": token }), operation]);
      try { return (await q("select name from storage.objects where bucket_id='review-materials' and name=$1", [name])).rows; }
      finally { await q("select set_config('request.headers','{}',false),set_config('storage.operation','',false)"); }
    });
  }
  const segmentAccess = (id, index, action = "play_original", actor = ids.lead) =>
    run(actor, async () => value(await q("select authorize_review_segment_access($1,$2,$3,$4) value", [ids.dept, id, index, action])));
  async function saved(manifest = manifestOf(960_000, 16_073), changes = {}) {
    const input = sessionInput(changes);
    await start(input);
    await save(input.id, manifest);
    return input.id;
  }

  await settings(true);
  const main = sessionInput();
  live.add(main.id);
  const mainManifest = manifestOf(960_000, 16_073);

  await check("recording segments: save requires the recorder's live session, lead consent and the switch", async () => {
    await start(main);
    for (const actor of [ids.member, ids.admin]) await rejects(() => save(main.id, mainManifest, undefined, actor), "42501");
    await rejects(() => save(main.id, mainManifest, undefined, ids.lead2), "P0002");
    await rejects(() => save(main.id, mainManifest, undefined, ids.outsider), "42501");
    await rejects(() => save(main.id, mainManifest, undefined, ids.outsider, ids.other), "P0002");
    await rejects(() => save(main.id, mainManifest, undefined, ids.lead, ids.other), "42501");
    await settings(false);
    await rejects(() => save(main.id, mainManifest), "42501", "browser_recording_disabled");
    await settings(true);
    assert.equal((await sessionRow(main.id)).state, "active");
    assert.equal(await reviewRow(main.id), undefined);
  });

  await check("recording segments: SQL re-validates manifest v1 and capture metadata; failures create nothing", async () => {
    const good = JSON.stringify(mainManifest);
    const goodCapture = JSON.stringify(captureFor(mainManifest));
    const bad = [
      [JSON.stringify({ ...mainManifest, version: 2 }), goodCapture],
      [JSON.stringify({ ...mainManifest, version: "1" }), goodCapture],
      [good.replace('"version":1', '"version":1.0'), goodCapture],
      [JSON.stringify({ version: 1, segments: [] }), goodCapture],
      [JSON.stringify(manifestOf(...Array(31).fill(960_000))), JSON.stringify({ paused: false, interrupted: false, captured_samples: 28_800_000 })],
      [JSON.stringify({ version: 1, segments: [seg(1, 16_073)] }), goodCapture],
      [JSON.stringify({ version: 1, segments: [seg(0, 960_000), seg(2, 10)] }), goodCapture],
      [JSON.stringify({ version: 1, segments: [seg(0, 960_000), seg(0, 10)] }), goodCapture],
      [JSON.stringify({ version: 1, segments: [seg(0, 10), seg(1, 10)] }), goodCapture],
      [JSON.stringify({ version: 1, segments: [{ ...seg(0, 10), bytes: 63 }] }), goodCapture],
      [JSON.stringify({ version: 1, segments: [{ ...seg(0, 10), sample_count: 0, bytes: 44 }] }), goodCapture],
      [JSON.stringify({ version: 1, segments: [seg(0, 960_001)] }), goodCapture],
      [JSON.stringify({ version: 1, segments: [{ ...seg(0, 10), sha256: "A".repeat(64) }] }), goodCapture],
      [JSON.stringify({ version: 1, segments: [{ ...seg(0, 10), sha256: 1 }] }), goodCapture],
      [JSON.stringify({ version: 1, segments: [{ ...seg(0, 10), index: "0" }] }), goodCapture],
      [JSON.stringify({ version: 1, segments: [{ ...seg(0, 10), object_path: "other/dept.wav" }] }), goodCapture],
      [JSON.stringify({ ...mainManifest, dept_id: ids.other }), goodCapture],
      [JSON.stringify([mainManifest]), goodCapture],
      [good, JSON.stringify({ ...captureFor(mainManifest), consent_snapshot: [] })],
      [good, JSON.stringify({ ...captureFor(mainManifest), captured_samples: total(mainManifest) - 1 })],
      [good, JSON.stringify({ ...captureFor(mainManifest), captured_samples: 1.5 })],
      [good, JSON.stringify({ ...captureFor(mainManifest), paused: "true" })],
      [good, JSON.stringify({ paused: false, interrupted: false })],
      [good, "null"],
      ["null", goodCapture],
    ];
    for (const [manifestJson, captureJson] of bad) await rejects(() => saveRaw(main.id, manifestJson, captureJson), "22023", "invalid_recording_manifest");
    assert.equal((await sessionRow(main.id)).state, "active");
    assert.equal(await count("select count(*)::int n from review_original_segments where review_id=$1", [main.id]), 0);
  });

  await check("recording segments: SQL fingerprint equals the pinned canonical vector and material fields come from the session", async () => {
    const vectorSession = sessionInput();
    await start(vectorSession);
    const vector = { version: 1, segments: [{ index: 0, sample_count: 1, bytes: 46, sha256: "a".repeat(64) }] };
    await save(vectorSession.id, vector, { paused: false, interrupted: false, captured_samples: 1 });
    assert.equal((await reviewRow(vectorSession.id)).fingerprint, "9f027effe68d54e110ca75f4ab40f9683daac1721326e7fc3d83949c14b6b4d4");
    const jobsBefore = await count("select count(*)::int n from jobs where kind in ('verify_review_segment','process_review')", []);
    const result = await save(main.id, mainManifest, captureFor(mainManifest, { paused: true, captured_samples: total(mainManifest) + 16_000 }));
    assert.equal(result.review_id, main.id);
    assert.equal(result.state, "saving");
    assert.deepEqual(result.segments, [
      { index: 0, attempt: 1, path: path(main.id, 0), status: "awaiting_upload", error_code: null },
      { index: 1, attempt: 1, path: path(main.id, 1), status: "awaiting_upload", error_code: null },
    ]);
    const review = await reviewRow(main.id);
    const session = await sessionRow(main.id);
    assert.equal(review.fingerprint, fingerprint(mainManifest));
    assert.equal(review.original_layout, "audio_segments");
    assert.equal(review.original_path, null);
    assert.equal(review.status, "uploading");
    assert.equal(review.original_uploaded, false);
    assert.equal(review.input_method, "microphone");
    assert.equal(review.kind, "audio");
    assert.equal(review.synthetic, false);
    assert.equal(review.visibility, "leads_only");
    assert.equal(Number(review.file_size), 1_920_044 + 32_190);
    assert.ok(Math.abs(review.duration - total(mainManifest) / 16000) < 1e-9);
    assert.equal(review.title, "합성 회의 [이메일]");
    assert.equal(review.filename, "합성 회의 [이메일].wav");
    assert.deepEqual([...review.participants].sort(), [ids.lead, ids.member].sort());
    assert.equal(review.consent_confirmed_by, ids.lead);
    assert.equal(new Date(review.consent_confirmed_at).getTime(), new Date(session.started_at).getTime());
    assert.deepEqual(review.capture_metadata.consent_snapshot, session.consent_snapshot);
    assert.equal(review.capture_metadata.retained_samples, total(mainManifest));
    assert.equal(review.capture_metadata.captured_samples, total(mainManifest) + 16_000);
    assert.equal(review.capture_metadata.manifest_version, 1);
    assert.equal(review.capture_metadata.meeting_provider, "in_person");
    assert.equal(session.state, "saving");
    assert.equal(await count("select count(*)::int n from jobs where kind in ('verify_review_segment','process_review')", []), jobsBefore);
    assert.equal(await count("select count(*)::int n from review_parts where review_id=$1", [main.id]), 0);
  });

  await check("recording segments: save retries are idempotent; a different manifest or an existing material conflicts", async () => {
    await park();
    const again = await save(main.id, mainManifest, captureFor(mainManifest, { interrupted: true }));
    assert.equal(again.state, "saving");
    assert.equal(await count("select count(*)::int n from review_original_segments where review_id=$1", [main.id]), 2);
    assert.equal((await reviewRow(main.id)).capture_metadata.interrupted, false);
    await rejects(() => save(main.id, { version: 1, segments: [seg(0, 960_000), seg(1, 16_073, "changed")] }), "40001", "recording_conflict");
    const collision = sessionInput();
    await start(collision);
    await run(ids.lead, () => q("select create_review($1,$2::jsonb)", [ids.dept, JSON.stringify({ id: collision.id, kind: "audio", title: "업로드", filename: "u.wav", size: 100, fingerprint: "b".repeat(64), duration: 30, visibility: "dept", participants: [], synthetic: true, consent_confirmed: true })]));
    await rejects(() => save(collision.id, mainManifest), "40001", "recording_conflict");
    const closed = sessionInput();
    await start(closed);
    await discard(closed.id);
    await rejects(() => save(closed.id, mainManifest), "55000", "recording_closed");
    const expired = sessionInput();
    await start(expired);
    await q("update review_recordings set started_at=now()-interval '25 hours',expires_at=now()-interval '1 hour' where id=$1", [expired.id]);
    await rejects(() => save(expired.id, mainManifest), "55000", "recording_closed");
  });

  await check("recording segments: Storage INSERT accepts only the recorder's issued awaiting path", async () => {
    await upload(ids.lead, path(main.id, 0));
    for (const actor of [ids.lead2, ids.member, ids.outsider, ids.admin]) await rejects(() => upload(actor, path(main.id, 1)), "42501");
    for (const name of [path(main.id, 1, 2), path(main.id, 2), `${ids.dept}/${main.id}/parts/0.wav`, `${ids.dept}/${main.id}/windows/0`,
      `${ids.dept}/${main.id}/original`, `${ids.other}/${main.id}/original-segments/1-1.wav`, `${ids.dept}/${main.id}/original-segments/../1-1.wav`]) {
      await rejects(() => upload(ids.lead, name), "42501");
    }
    await settings(false);
    await rejects(() => upload(ids.lead, path(main.id, 1)), "42501");
    await settings(true);
    const window = (await q("select started_at,expires_at from review_recordings where id=$1", [main.id])).rows[0];
    await q("update review_recordings set started_at=now()-interval '25 hours',expires_at=now()-interval '1 hour' where id=$1", [main.id]);
    await rejects(() => upload(ids.lead, path(main.id, 1)), "42501");
    await q("update review_recordings set started_at=$2,expires_at=$3 where id=$1", [main.id, window.started_at, window.expires_at]);
    await q("update members set role='member' where user_id=$1 and dept_id=$2", [ids.lead, ids.dept]);
    await rejects(() => upload(ids.lead, path(main.id, 1)), "42501");
    await q("update members set role='lead' where user_id=$1 and dept_id=$2", [ids.lead, ids.dept]);
    assert.equal(await count("select count(*)::int n from storage.objects where name like $1", [`%/${main.id}/%`]), 1);
  });

  await check("recording segments: finalize queues one deterministic verification per awaiting segment and never marks saved", async () => {
    await rejects(() => finalize(randomUUID()), "P0002");
    await rejects(() => finalize(main.id, ids.lead2), "P0002");
    await rejects(() => finalize(main.id, ids.member), "42501");
    const unsaved = sessionInput();
    await start(unsaved);
    await rejects(() => finalize(unsaved.id), "55000", "recording_not_saved");
    await settings(false);
    await rejects(() => finalize(main.id), "42501", "browser_recording_disabled");
    await settings(true);
    const result = await finalize(main.id);
    assert.equal(result.state, "saving");
    assert.deepEqual(result.segments.map(s => s.status), ["verifying", "verifying"]);
    const jobs = (await q("select id,payload from jobs where kind='verify_review_segment' and payload->>'reviewId'=$1 order by payload->>'index'", [main.id])).rows;
    assert.deepEqual(jobs.map(job => job.payload), [0, 1].map(index => ({ reviewId: main.id, index, attempt: 1, run: 1 })));
    for (const job of jobs) {
      const expected = (await q("select md5('review-segment:'||$1||':'||$2||':1')::uuid id", [main.id, job.payload.index])).rows[0].id;
      assert.equal(job.id, expected);
    }
    await finalize(main.id);
    assert.equal(await count("select count(*)::int n from jobs where kind='verify_review_segment' and payload->>'reviewId'=$1", [main.id]), 2);
    assert.equal((await reviewRow(main.id)).status, "uploading");
    assert.equal((await sessionRow(main.id)).state, "saving");
    await rejects(() => upload(ids.lead, path(main.id, 1)), "42501");
    await run(ids.lead, async () => {
      await rejects(() => q("select claim_review_segment($1,0,1,1,$2)", [main.id, randomUUID()]), "42501");
      await rejects(() => q("select finish_review_segment($1,0,$2,'verified')", [main.id, randomUUID()]), "42501");
    });
  });

  await check("recording segments: worker claims are exclusive and bound to attempt, run and lease", async () => {
    assert.equal((await claim(main.id, 0, 2, 1)).value, null);
    assert.equal((await claim(main.id, 0, 1, 2)).value, null);
    assert.equal((await claim(main.id, 5, 1, 1)).value, null);
    const first = await claim(main.id, 0, 1, 1);
    assert.deepEqual(first.value, { review_id: main.id, dept_id: ids.dept, index: 0, attempt: 1, object_path: path(main.id, 0), sample_count: 960_000, bytes: 1_920_044, sha256: mainManifest.segments[0].sha256 });
    assert.equal((await claim(main.id, 0, 1, 1)).value, null);
    assert.equal(await finish(main.id, 0, randomUUID(), "verified"), false);
    await q("update review_original_segments set lease_until=now()-interval '1 second' where review_id=$1 and segment_index=0", [main.id]);
    assert.equal(await finish(main.id, 0, first.lease, "verified"), false);
    const second = await claim(main.id, 0, 1, 1);
    assert.ok(second.value);
    await asService(() => rejects(() => q("select finish_review_segment($1,0,$2,'done')", [main.id, second.lease]), "22023"));
    assert.equal(await finish(main.id, 0, second.lease, "retry"), true);
    const released = await segRow(main.id, 0);
    assert.equal(released.status, "verifying"); assert.equal(released.lease, null); assert.equal(released.error_code, "segment_unavailable");
    await settle(main.id, 0);
    assert.equal((await segRow(main.id, 0)).status, "verified");
    assert.equal((await reviewRow(main.id)).status, "uploading");
  });

  await check("recording segments: missing keeps the attempt, mismatch moves to a new attempt path under the same ID", async () => {
    await settle(main.id, 1, "missing");
    let row = await segRow(main.id, 1);
    assert.deepEqual([row.status, row.attempt, row.error_code, row.object_path], ["awaiting_upload", 1, "segment_missing", path(main.id, 1)]);
    await upload(ids.lead, path(main.id, 1));
    await finalize(main.id);
    row = await segRow(main.id, 1);
    assert.deepEqual([row.status, row.verify_run], ["verifying", 2]);
    assert.equal(await count("select count(*)::int n from jobs where kind='verify_review_segment' and payload->>'reviewId'=$1", [main.id]), 3);
    await settle(main.id, 1, "mismatch");
    row = await segRow(main.id, 1);
    assert.deepEqual([row.status, row.attempt, row.error_code, row.object_path], ["awaiting_upload", 2, "segment_mismatch", path(main.id, 1, 2)]);
    await rejects(() => upload(ids.lead, path(main.id, 1, 1)), "42501");
    await upload(ids.lead, path(main.id, 1, 2));
    assert.deepEqual(await key(main.id), { recording_id: main.id, user_id: ids.lead, dept_id: ids.dept, key_version: 1 });
  });

  await check("recording segments: completion happens once and creates windows and transcription jobs equal to segments", async () => {
    await finalize(main.id);
    const stale = await claim(main.id, 1, 2, 3);
    assert.ok(stale.value);
    assert.equal(await finish(main.id, 1, stale.lease, "verified"), true);
    const review = await reviewRow(main.id);
    assert.deepEqual([review.status, review.original_uploaded], ["processing", true]);
    assert.equal((await sessionRow(main.id)).state, "completed");
    const parts = (await q("select id,part_index,start_seconds,end_seconds,object_path,status,attempt from review_parts where review_id=$1 order by part_index", [main.id])).rows;
    assert.deepEqual(parts.map(p => [p.part_index, p.start_seconds, p.object_path, p.status, p.attempt]), [
      [0, 0, `${ids.dept}/${main.id}/windows/0`, "queued", 1], [1, 60, `${ids.dept}/${main.id}/windows/1`, "queued", 1],
    ]);
    assert.ok(Math.abs(parts[0].end_seconds - 61) < 1e-9);
    assert.ok(Math.abs(parts[1].end_seconds - (60 + 16_073 / 16000)) < 1e-9);
    const jobs = (await q("select j.id,j.payload from jobs j join review_parts p on p.id::text=j.payload->>'partId' where p.review_id=$1 and j.kind='process_review' order by p.part_index", [main.id])).rows;
    assert.equal(jobs.length, 2);
    for (const [i, job] of jobs.entries()) {
      assert.deepEqual(job.payload, { partId: parts[i].id, attempt: 1 });
      assert.equal(job.id, (await q("select md5('review-part:'||$1||':1')::uuid id", [parts[i].id])).rows[0].id);
    }
    assert.equal(await finish(main.id, 1, stale.lease, "verified"), false);
    assert.equal((await claim(main.id, 1, 2, 3)).value, null);
    await rejects(() => key(main.id), "P0002", "recording_unavailable");
    assert.equal((await save(main.id, mainManifest)).state, "completed");
    assert.equal((await finalize(main.id)).state, "completed");
    await rejects(() => discard(main.id), "55000", "recording_already_saved");
    assert.equal(await count("select count(*)::int n from review_parts where review_id=$1", [main.id]), 2);
  });

  await check("recording segments: out-of-order verification still completes exactly once", async () => {
    await park();
    const id = await saved(manifestOf(960_000, 960_000, 5_000));
    for (const index of [0, 1, 2]) await upload(ids.lead, path(id, index));
    await finalize(id);
    const leases = [];
    for (const index of [2, 0, 1]) leases.push([index, (await claim(id, index, 1, 1)).lease]);
    assert.equal(await finish(id, 2, leases[0][1], "verified"), true);
    assert.equal((await sessionRow(id)).state, "saving");
    assert.equal(await finish(id, 0, leases[1][1], "verified"), true);
    assert.equal(await count("select count(*)::int n from review_parts where review_id=$1", [id]), 0);
    assert.equal(await finish(id, 1, leases[2][1], "verified"), true);
    assert.equal(await count("select count(*)::int n from review_parts where review_id=$1", [id]), 3);
    assert.equal(await count("select count(*)::int n from jobs j join review_parts p on p.id::text=j.payload->>'partId' where p.review_id=$1 and j.kind='process_review'", [id]), 3);
    const ends = (await q("select end_seconds from review_parts where review_id=$1 order by part_index", [id])).rows.map(r => r.end_seconds);
    // A short successor lends only its own length; the last window borrows nothing.
    for (const [actual, expected] of [[ends[0], 61], [ends[1], 60 + (960_000 + 5_000) / 16000], [ends[2], 120 + 5_000 / 16000]])
      assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
  });

  await check("recording segments: three mismatches fail visibly; the recorder can still discard and purge", async () => {
    await park();
    const id = await saved(manifestOf(10));
    for (const attempt of [1, 2, 3]) {
      await upload(ids.lead, path(id, 0, attempt));
      await finalize(id);
      await settle(id, 0, "mismatch");
    }
    const row = await segRow(id, 0);
    assert.deepEqual([row.status, row.attempt, row.error_code], ["failed", 3, "segment_invalid"]);
    assert.deepEqual([(await reviewRow(id)).status, (await reviewRow(id)).status_reason], ["failed", "segment_invalid"]);
    await rejects(() => finalize(id), "55000", "recording_failed");
    await rejects(() => upload(ids.lead, path(id, 0, 3)), "42501");
    assert.equal((await discard(id)).state, "discarded");
    const review = await reviewRow(id);
    assert.deepEqual([review.status, review.status_reason], ["cancelled", "recording_discarded"]);
    assert.ok(review.original_deleted_at);
    assert.equal(await count("select count(*)::int n from jobs where id=md5('recording-purge:'||$1)::uuid and kind='purge_review_files'", [id]), 1);
  });

  await check("recording segments: transcription, reextract and publish require every segment verified", async () => {
    await park();
    const id = await saved(manifestOf(960_000, 10));
    await upload(ids.lead, path(id, 0));
    await finalize(id);
    await settle(id, 0);
    await run(ids.lead, async () => {
      await rejects(() => q("select authorize_review_access($1,$2,'reextract')", [ids.dept, id]), "P0002", "original_unavailable");
      await rejects(() => q("select review_action($1,1,'reextract')", [id]), "P0002", "original_unavailable");
      await rejects(() => q("select publish_review($1,1)", [id]), "22023");
      await rejects(() => q("select queue_review_part($1,0)", [id]), "P0002");
    });
    await rejects(() => segmentAccess(id, 0), "P0002", "original_unavailable");
    const parts = (await q("select id,attempt,part_index from review_parts where review_id=$1 order by part_index", [main.id])).rows;
    const blockedLease = randomUUID();
    assert.equal(await asService(async () => value(await q("select claim_review_part($1,$2,$3) value", [parts[1].id, parts[1].attempt, blockedLease]))), null);
    await q("update review_parts set updated_at=now()-interval '3 minutes' where id=$1", [parts[1].id]);
    assert.equal(await asService(async () => value(await q("select sweep_review_parts() value"))), 0);
    assert.equal((await q("select status from review_parts where id=$1", [parts[1].id])).rows[0].status, "queued");
    for (const part of parts) {
      const lease = randomUUID();
      const claimed = await asService(async () => value(await q("select claim_review_part($1,$2,$3) value", [part.id, part.attempt, lease])));
      assert.equal(claimed.original_layout, "audio_segments");
      if (part.part_index === 0) assert.equal(claimed.previous_last_word_end_in_window, null);
      else assert.ok(Math.abs(claimed.previous_last_word_end_in_window - 0.3) < 1e-9);
      assert.deepEqual(claimed.manifest, { version: 1, segments: [
        { index: 0, sample_count: 960_000, bytes: 1_920_044, sha256: mainManifest.segments[0].sha256 },
        { index: 1, sample_count: 16_073, bytes: 32_190, sha256: mainManifest.segments[1].sha256 },
      ] });
      assert.deepEqual(claimed.segment_paths, { current: path(main.id, part.part_index, part.part_index === 1 ? 2 : 1), next: part.part_index === 0 ? path(main.id, 1, 2) : null });
      const section = { id: `part-${part.part_index}-0`, text: "합성 받아쓴 글", original_text: "합성 받아쓴 글", origin: "transcribed", edited: false, location: null, start_seconds: part.part_index * 60, end_seconds: part.part_index * 60 + 1, confidence: "normal", boundary_review: false };
      if (part.part_index === 0) {
        await asService(() => rejects(() => q("select finish_review_recording_part($1,$2,$3::jsonb,null,$4)", [part.id, lease, JSON.stringify([{ ...section, text: "qa@example.com" }]), 60.3]), "22023", "transcription_sections_invalid"));
        await asService(() => rejects(() => q("select finish_review_recording_part($1,$2,$3::jsonb,null,$4)", [part.id, lease, JSON.stringify([section]), 62]), "22023", "transcription_boundary_invalid"));
      }
      const jobsBefore = await count("select count(*)::int n from jobs where kind='process_review' and payload->>'partId'=$1", [parts[1].id]);
      assert.equal(await asService(async () => value(await q("select finish_review_recording_part($1,$2,$3::jsonb,null,$4) value", [part.id, lease, JSON.stringify([section]), part.part_index === 0 ? 60.3 : 0.8]))), true);
      assert.equal(await asService(async () => value(await q("select finish_review_recording_part($1,$2,$3::jsonb,null,$4) value", [part.id, lease, JSON.stringify([section]), 0.8]))), false);
      if (part.part_index === 0) assert.equal(await count("select count(*)::int n from jobs where kind='process_review' and payload->>'partId'=$1", [parts[1].id]), jobsBefore + 1);
    }
    assert.equal((await reviewRow(main.id)).status, "ready");
    assert.deepEqual((await q("select last_word_end_seconds from review_parts where review_id=$1 order by part_index", [main.id])).rows.map(row => row.last_word_end_seconds), [60.3, 0.8]);
    const eventsBefore = await count("select count(*)::int n from review_access_events where review_id=$1 and action='reextract'", [main.id]);
    await run(ids.lead2, () => q("select review_action($1,1,'reextract')", [main.id]));
    const requeued = (await q("select status,attempt,last_word_end_seconds from review_parts where review_id=$1 order by part_index", [main.id])).rows;
    assert.deepEqual(requeued, [{ status: "queued", attempt: 2, last_word_end_seconds: null }, { status: "queued", attempt: 2, last_word_end_seconds: null }]);
    assert.equal((await reviewRow(main.id)).status, "processing");
    assert.equal(await count("select count(*)::int n from jobs j join review_parts p on p.id::text=j.payload->>'partId' where p.review_id=$1 and j.kind='process_review' and (j.payload->>'attempt')::int=2", [main.id]), 2);
    assert.equal(await count("select count(*)::int n from review_access_events where review_id=$1 and action='reextract'", [main.id]), eventsBefore + 1);
    for (const name of [`${ids.dept}/${main.id}/windows/0`, `${ids.dept}/${main.id}/parts/0.wav`, path(main.id, 0)]) await rejects(() => upload(ids.lead, name), "42501");
    // single_file keeps its upload/queue path and is labelled for the worker.
    const single = (await q("select id from reviewed_materials where dept_id=$1 and original_layout='single_file' limit 1", [ids.dept])).rows[0].id;
    await upload(ids.lead, `${ids.dept}/${single}/parts/0.wav`);
    await run(ids.lead, () => q("select queue_review_part($1,0)", [single]));
    const singlePart = (await q("select id,attempt from review_parts where review_id=$1 and part_index=0", [single])).rows[0];
    const claimedSingle = await asService(async () => value(await q("select claim_review_part($1,$2,$3) value", [singlePart.id, singlePart.attempt, randomUUID()])));
    assert.equal(claimedSingle.original_layout, "single_file");
    assert.equal(claimedSingle.manifest, undefined);
    assert.equal(claimedSingle.object_path, `${ids.dept}/${single}/parts/0.wav`);
  });

  await check("recording segments: in-flight transcription cannot finish after consent withdrawal or original expiry", async () => {
    await park();
    const section = { id: "part-0-0", text: "합성 전사", original_text: "합성 전사", origin: "transcribed", edited: false, location: null, start_seconds: 0, end_seconds: 1 };
    const withdrawn = await saved(manifestOf(10_000), { participants: [ids.member2] });
    await upload(ids.lead, path(withdrawn, 0));
    await finalize(withdrawn);
    await settle(withdrawn, 0);
    const withdrawnPart = (await q("select id,attempt from review_parts where review_id=$1", [withdrawn])).rows[0];
    const withdrawnLease = randomUUID();
    assert.ok(await asService(async () => value(await q("select claim_review_part($1,$2,$3) value", [withdrawnPart.id, withdrawnPart.attempt, withdrawnLease]))));
    await q("update members set consented_at=null where user_id=$1 and dept_id=$2", [ids.member2, ids.dept]);
    assert.equal(await asService(async () => value(await q("select finish_review_recording_part($1,$2,$3::jsonb,null,1) value", [withdrawnPart.id, withdrawnLease, JSON.stringify([section])]))), false);
    assert.notEqual((await reviewRow(withdrawn)).status, "ready");
    await q("update members set consented_at=now() where user_id=$1 and dept_id=$2", [ids.member2, ids.dept]);

    const expired = await saved(manifestOf(10_000));
    await upload(ids.lead, path(expired, 0));
    await finalize(expired);
    await settle(expired, 0);
    const expiredPart = (await q("select id,attempt from review_parts where review_id=$1", [expired])).rows[0];
    const expiredLease = randomUUID();
    assert.ok(await asService(async () => value(await q("select claim_review_part($1,$2,$3) value", [expiredPart.id, expiredPart.attempt, expiredLease]))));
    await q("update reviewed_materials set original_deleted_at=now() where id=$1", [expired]);
    assert.equal(await asService(async () => value(await q("select finish_review_recording_part($1,$2,$3::jsonb,null,1) value", [expiredPart.id, expiredLease, JSON.stringify([section])]))), false);
    assert.notEqual((await reviewRow(expired)).status, "ready");
  });

  await check("recording segments: segment tickets are per verified segment, single use and share the minute limit", async () => {
    for (const action of ["play_original", "download_original"]) {
      await run(ids.lead, () => rejects(() => q("select authorize_review_access($1,$2,$3)", [ids.dept, main.id, action]), "22023", "segment_required"));
    }
    const grant = await segmentAccess(main.id, 0);
    assert.deepEqual(Object.keys(grant).sort(), ["filename", "kind", "path", "sample_count", "segment_index", "token"]);
    assert.deepEqual([grant.path, grant.segment_index, grant.sample_count, grant.kind], [path(main.id, 0), 0, 960_000, "audio"]);
    assert.equal((await q("select segment_index from review_access_events a join private.review_access_tickets t on t.event_id=a.id where t.token=$1", [grant.token])).rows[0].segment_index, 0);
    assert.equal((await read(ids.lead, grant.token, path(main.id, 1, 2))).length, 0);
    assert.equal((await read(ids.lead2, grant.token, path(main.id, 0))).length, 0);
    assert.equal((await read(ids.lead, grant.token, path(main.id, 0), "storage.object.sign")).length, 0);
    assert.equal((await read(ids.lead, grant.token, path(main.id, 0))).length, 1);
    assert.equal((await read(ids.lead, grant.token, path(main.id, 0))).length, 0);
    const other = await segmentAccess(main.id, 1, "play_original", ids.lead2);
    assert.equal(other.path, path(main.id, 1, 2));
    assert.equal((await read(ids.lead2, other.token, path(main.id, 1, 2))).length, 1);
    for (const index of [2, 30, -1, null]) await rejects(() => segmentAccess(main.id, index), "22023");
    await rejects(() => segmentAccess(main.id, 0, "export"), "22023");
    await rejects(() => segmentAccess(main.id, 0, "download_original"), "42501", "original_download_disabled");
    await settings(true, true);
    const download = await segmentAccess(main.id, 0, "download_original");
    await settings(true, false);
    assert.equal((await read(ids.lead, download.token, path(main.id, 0))).length, 0);
    for (const actor of [ids.member, ids.outsider, ids.admin]) await rejects(() => segmentAccess(main.id, 0, "play_original", actor), "42501");
    const single = (await q("select id from reviewed_materials where dept_id=$1 and original_layout='single_file' limit 1", [ids.dept])).rows[0];
    await rejects(() => segmentAccess(single.id, 0), "22023", "invalid_access_action");
    await q("update review_access_events set created_at=now()-interval '2 minutes' where actor_id=$1", [ids.lead]);
    await run(ids.lead, async () => {
      for (let n = 0; n < 30; n++) await q("select authorize_review_segment_access($1,$2,0,'play_original')", [ids.dept, main.id]);
      for (let n = 0; n < 30; n++) await q("select authorize_review_access($1,$2,'export')", [ids.dept, main.id]);
      await rejects(() => q("select authorize_review_segment_access($1,$2,1,'play_original')", [ids.dept, main.id]), "P0001", "rate_limited");
    });
    await q("update review_access_events set created_at=now()-interval '2 minutes' where actor_id=$1", [ids.lead]);
  });

  await check("recording segments: cancel, delete and discard end the session and schedule purges", async () => {
    await park();
    const cancelled = await saved(manifestOf(10));
    await upload(ids.lead, path(cancelled, 0));
    await finalize(cancelled);
    await run(ids.lead2, () => q("select review_action($1,1,'cancel')", [cancelled]));
    let session = await sessionRow(cancelled);
    assert.deepEqual([session.state, session.state_reason], ["discarded", "review_removed"]);
    let review = await reviewRow(cancelled);
    assert.equal(review.status, "cancelled"); assert.ok(review.original_deleted_at);
    assert.equal(await count("select count(*)::int n from jobs where kind='verify_review_segment' and payload->>'reviewId'=$1 and status='failed' and last_error='cancelled'", [cancelled]), 1);
    assert.equal(await count("select count(*)::int n from jobs where kind='purge_review_files' and payload->>'reviewId'=$1", [cancelled]), 1);
    assert.equal((await claim(cancelled, 0, 1, 1)).value, null);
    await rejects(() => key(cancelled), "P0002");

    const deleted = await saved(manifestOf(10));
    await run(ids.lead2, () => q("select review_action($1,1,'delete')", [deleted]));
    session = await sessionRow(deleted);
    assert.deepEqual([session.state, session.state_reason], ["discarded", "review_removed"]);
    review = await reviewRow(deleted);
    assert.equal(review.status, "deleted"); assert.ok(review.deleted_at);
    assert.ok(await count("select count(*)::int n from jobs where kind='purge_review_files' and payload->>'reviewId'=$1", [deleted]) >= 1);

    const discarded = await saved(manifestOf(10));
    assert.equal((await discard(discarded)).state, "discarded");
    assert.equal((await discard(discarded)).state, "discarded");
    review = await reviewRow(discarded);
    assert.deepEqual([review.status, review.status_reason], ["cancelled", "recording_discarded"]);
    await rejects(() => upload(ids.lead, path(discarded, 0)), "42501");
    assert.equal(await count("select count(*)::int n from jobs where kind='purge_review_files' and payload->>'reviewId'=$1", [discarded]), 1);
  });

  await check("recording segments: expiry sweep cancels unfinished saves and requeues or fails stale verification", async () => {
    await park();
    const staleId = await saved(manifestOf(10));
    await upload(ids.lead, path(staleId, 0));
    await finalize(staleId);
    await claim(staleId, 0, 1, 1);
    await q("update review_original_segments set lease_until=now()-interval '1 second' where review_id=$1", [staleId]);
    const expiring = await saved(manifestOf(10));
    await q("update review_recordings set started_at=now()-interval '25 hours',expires_at=now()-interval '1 hour' where id=$1", [expiring]);
    const exhausted = await saved(manifestOf(10));
    await upload(ids.lead, path(exhausted, 0));
    await finalize(exhausted);
    await q("update review_original_segments set verify_run=10,updated_at=now()-interval '3 minutes' where review_id=$1", [exhausted]);
    await q("update jobs set status='failed' where kind='verify_review_segment' and payload->>'reviewId'=$1", [exhausted]);
    await run(ids.lead, () => rejects(() => q("select sweep_review_recordings()"), "42501"));
    assert.ok(await asService(async () => (await q("select sweep_review_recordings() n")).rows[0].n) >= 1);
    const requeued = await segRow(staleId, 0);
    assert.deepEqual([requeued.status, requeued.verify_run, requeued.lease], ["verifying", 2, null]);
    assert.equal(await count("select count(*)::int n from jobs where id=md5('review-segment:'||$1||':0:2')::uuid", [staleId]), 1);
    const expired = await sessionRow(expiring);
    assert.deepEqual([expired.state, expired.state_reason], ["expired", "session_expired"]);
    const expiredReview = await reviewRow(expiring);
    assert.deepEqual([expiredReview.status, expiredReview.status_reason], ["cancelled", "session_expired"]);
    assert.ok(expiredReview.original_deleted_at);
    assert.equal(await count("select count(*)::int n from jobs where id=md5('recording-purge:'||$1)::uuid", [expiring]), 1);
    const failed = await segRow(exhausted, 0);
    assert.deepEqual([failed.status, failed.error_code], ["failed", "timeout"]);
    assert.deepEqual([(await reviewRow(exhausted)).status, (await reviewRow(exhausted)).status_reason], ["failed", "timeout"]);
    assert.equal(await asService(async () => (await q("select sweep_review_recordings() n")).rows[0].n), 0);
    assert.equal(await count("select count(*)::int n from jobs where id=md5('recording-purge:'||$1)::uuid", [expiring]), 1);
    await q("update review_recordings set started_at=now()-interval '25 hours',expires_at=now()-interval '1 hour' where id=$1", [exhausted]);
    await asService(() => q("select sweep_review_recordings()"));
    assert.deepEqual([(await reviewRow(exhausted)).status, (await reviewRow(exhausted)).status_reason], ["cancelled", "session_expired"]);
  });

  await check("recording segments: consent withdrawal revokes, deletes the material and fails queued verification", async () => {
    await park();
    const withdrawn = await saved(manifestOf(10), { participants: [ids.member2] });
    await upload(ids.lead, path(withdrawn, 0));
    await finalize(withdrawn);
    await q("update members set consented_at=null where user_id=$1 and dept_id=$2", [ids.member2, ids.dept]);
    const session = await sessionRow(withdrawn);
    assert.deepEqual([session.state, session.state_reason], ["revoked", "consent_withdrawn"]);
    const review = await reviewRow(withdrawn);
    assert.deepEqual([review.status, review.status_reason], ["deleted", "consent_withdrawn"]);
    assert.ok(review.deleted_at && review.original_deleted_at);
    assert.equal(await count("select count(*)::int n from jobs where kind='verify_review_segment' and payload->>'reviewId'=$1 and status='failed' and last_error='consent_withdrawn'", [withdrawn]), 1);
    assert.ok(await count("select count(*)::int n from jobs where kind='purge_review_files' and payload->>'reviewId'=$1", [withdrawn]) >= 1);
    assert.equal((await claim(withdrawn, 0, 1, 1)).value, null);
    await q("update members set consented_at=now() where user_id=$1 and dept_id=$2", [ids.member2, ids.dept]);
    await rejects(() => key(withdrawn), "P0002");
  });

  await check("recording segments: retention sweep includes confirmed segmented originals and fences access", async () => {
    await run(ids.lead, () => q("select set_review_original_retention($1,30)", [ids.dept]));
    await q("update reviewed_materials set confirmed_at=now()-interval '31 days',status='ready' where id=$1", [main.id]);
    await asService(() => q("select sweep_review_originals()"));
    assert.ok((await reviewRow(main.id)).original_deleted_at);
    assert.equal(await count("select count(*)::int n from jobs where id=md5('review-expiry:'||$1)::uuid and kind='purge_review_files'", [main.id]), 1);
    await rejects(() => segmentAccess(main.id, 0), "P0002");
    await run(ids.lead, () => q("select set_review_original_retention($1,null)", [ids.dept]));
  });

  await check("recording segments: RLS, direct writes, reviewer stop and function privilege matrix", async () => {
    for (const [actor, visible] of [[ids.lead, 2], [ids.lead2, 2], [ids.member, 0], [ids.outsider, 0], [ids.admin, 0]]) {
      assert.equal(await run(actor, async () => (await q("select count(*)::int n from review_original_segments where review_id=$1", [main.id])).rows[0].n), visible);
    }
    await run(ids.lead, async () => {
      await rejects(() => q("update review_original_segments set status='verified' where review_id=$1", [main.id]), "42501");
      await rejects(() => q("delete from review_original_segments where review_id=$1", [main.id]), "42501");
      await rejects(() => q("insert into review_original_segments(review_id,segment_index,sample_count,bytes,sha256,object_path) values($1,9,1,46,$2,'x')", [main.id, "a".repeat(64)]), "42501");
    });
    assert.equal(await count("select count(*)::int n from pg_trigger where tgrelid='public.review_original_segments'::regclass and tgname='demo_reviewer_read_only'", []), 1);
    const reviewer = "99999999-9999-4999-8999-999999999991";
    await q("insert into auth.users(id) values($1) on conflict do nothing", [reviewer]);
    await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$2,'lead','Reviewer',now()) on conflict do nothing", [reviewer, ids.dept]);
    const reviewerSession = sessionInput();
    await rejects(() => start(reviewerSession, reviewer), "42501");
    const privileges = [
      ["public.create_review_recording(uuid,uuid,jsonb,jsonb)", "authenticated"],
      ["public.finalize_review_recording(uuid,uuid)", "authenticated"],
      ["public.authorize_review_segment_access(uuid,uuid,integer,text)", "authenticated"],
      ["public.review_action(uuid,integer,text)", "authenticated"],
      ["public.discard_review_recording(uuid,uuid)", "authenticated"],
      ["public.claim_review_segment(uuid,integer,integer,integer,uuid)", "service_role"],
      ["public.finish_review_segment(uuid,integer,uuid,text)", "service_role"],
      ["public.claim_review_part(uuid,integer,uuid)", "service_role"],
      ["public.finish_review_recording_part(uuid,uuid,jsonb,text,double precision)", "service_role"],
      ["public.sweep_review_parts()", "service_role"],
      ["public.sweep_review_recordings()", "service_role"],
      ["public.review_action_before_transcription_storage(uuid,integer,text)", null],
      ["public.review_action_before_recordings(uuid,integer,text)", null],
      ["private.json_int(jsonb,bigint,bigint)", null],
      ["private.recording_enabled(uuid)", null],
      ["private.recording_participants_consented(uuid,uuid[])", null],
      ["private.review_original_retained(uuid)", null],
      ["private.review_segment_states(uuid)", null],
      ["private.cancel_recording_review(uuid,text)", null],
      ["private.enqueue_review_segment(uuid,integer)", null],
      ["private.review_original_available(uuid)", null],
      ["private.revoke_participant_recordings()", null],
    ];
    for (const [signature, allowed] of privileges) for (const role of ["anon", "authenticated", "service_role"]) {
      assert.equal((await q("select has_function_privilege($1,$2,'EXECUTE') ok", [role, signature])).rows[0].ok, role === allowed, `${role} ${signature}`);
    }
  });
}
