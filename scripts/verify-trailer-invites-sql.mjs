// Isolated PGlite verification for ADR-062 / phase 26 step 0.
// Never loads .env and never connects to the operating Supabase project.
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
const q = (sql, params = []) => db.query(sql, params);
let passed = 0;

async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

async function asRole(role, fn, claims = {}) {
  await db.exec(`set role ${role}`);
  await q(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false),set_config('request.jwt.claims',$3,false)",
    [claims.sub ?? "", role, JSON.stringify({ role, ...claims })],
  );
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await q(
      "select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false),set_config('request.jwt.claims','{}',false)",
    );
  }
}

const asUser = (user, fn) => asRole("authenticated", fn, { sub: user });
const asAnon = (fn) => asRole("anon", fn);
const asService = (fn) => asRole("service_role", fn);
const rejects = (message, code) => (error) =>
  error.message === message && (code === undefined || error.code === code);

function tokenHash(token) {
  return q(
    "select encode(sha256(convert_to($1,'UTF8')),'hex') value",
    [token],
  ).then(({ rows }) => rows[0].value);
}

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable
      as $$ select current_setting('request.jwt.claim.role', true) $$;
    create function auth.jwt() returns jsonb language sql stable
      as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);

  const baseMigrations = readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql") && !name.startsWith("0004_") && name <= "0028_trailer_assessment.sql")
    .sort();
  for (const file of baseMigrations) {
    if (file === "0026_org_admin.sql") {
      await db.exec(
        "alter default privileges in schema public grant all on functions to anon, authenticated, service_role",
      );
    }
    await db.exec(readFileSync(resolve("supabase/migrations", file), "utf8"));
    if (file === "0001_schema_v1.sql") {
      await db.exec(
        "grant all on all tables in schema public to anon, authenticated, service_role; grant all on all sequences in schema public to anon, authenticated, service_role",
      );
    }
  }
  await db.exec(
    readFileSync(resolve("supabase/migrations/0040_trailer_invites.sql"), "utf8"),
  );

  const ids = Object.fromEntries(
    [
      "org",
      "demoOrg",
      "dept",
      "otherDept",
      "demoDept",
      "lead",
      "member",
      "otherLead",
      "demoLead",
      "published",
      "review",
      "demoTrailer",
      "cascadeTrailer",
    ].map((key) => [key, randomUUID()]),
  );
  const scenarios = JSON.stringify([
    {
      id: "qa-scenario",
      title: "합성 지원자 과제",
      summary: "공개 승인을 마친 합성 시나리오입니다.",
      facts: [],
      dialogues: [],
      choices: [],
      ending: "결정 이유를 남깁니다.",
    },
  ]);
  const rubric = JSON.stringify([
    { key: "evidence", label: "근거", description: "근거를 확인했는가", weight: 3 },
  ]);
  const submissions = JSON.stringify([
    {
      scenario_id: "qa-scenario",
      choice_id: "choice-a",
      reason: "합성 지원자가 직접 작성한 이유입니다.",
      fact_ids: [],
      events: [],
    },
  ]);

  await q("insert into auth.users(id,email) values($1,'lead@example.test'),($2,'member@example.test'),($3,'other@example.test'),($4,'demo@example.test')", [ids.lead, ids.member, ids.otherLead, ids.demoLead]);
  await q("insert into orgs(id,name,is_demo,trailer_publish_enabled,trailer_assessment_enabled) values($1,'실제 조직',false,true,false),($2,'데모 조직',true,true,true)", [ids.org, ids.demoOrg]);
  await q("insert into departments(id,org_id,name) values($1,$4,'지원자 링크 부서'),($2,$4,'다른 부서'),($3,$5,'데모 부서')", [ids.dept, ids.otherDept, ids.demoDept, ids.org, ids.demoOrg]);
  await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$5,'lead','부서장',now()),($2,$5,'member','멤버',now()),($3,$6,'lead','다른 부서장',now()),($4,$7,'lead','데모 부서장',now())", [ids.lead, ids.member, ids.otherLead, ids.demoLead, ids.dept, ids.otherDept, ids.demoDept]);

  for (const [id, dept, status] of [
    [ids.published, ids.dept, "published"],
    [ids.review, ids.dept, "review"],
    [ids.demoTrailer, ids.demoDept, "published"],
    [ids.cascadeTrailer, ids.dept, "published"],
  ]) {
    await q(
      "insert into trailers(id,dept_id,status,source_decision_ids,scenarios,rubric,slug) values($1,$2,$3,$4::uuid[],$5::jsonb,$6::jsonb,$7)",
      [id, dept, status, `{${randomUUID()}}`, scenarios, rubric, status === "published" ? randomUUID().replaceAll("-", "").slice(0, 22) : null],
    );
    if (status === "published") {
      await q(
        "update trailers set gate_passed_hash=scenarios_hash,approval_hash=scenarios_hash where id=$1",
        [id],
      );
    }
  }

  const createInvites = (trailer, emails) =>
    q("select * from create_trailer_invites($1,$2::text[])", [trailer, emails]);
  const openInvite = (token, email) =>
    asAnon(() => q("select trailer_invite_open($1,$2) value", [token, email]));
  let firstInvite;

  await check("assessment flag gates real invitation creation and plaintext tokens are never stored", async () => {
    await asUser(ids.lead, () =>
      assert.rejects(
        () => createInvites(ids.published, ["candidate-a@example.test"]),
        rejects("invite_unavailable", "P0001"),
      ),
    );
    await q("update orgs set trailer_assessment_enabled=true where id=$1", [ids.org]);
    await asUser(ids.lead, async () => {
      firstInvite = (await createInvites(ids.published, ["  Candidate-A@Example.Test  "])).rows[0];
    });
    assert.match(firstInvite.token, /^[0-9a-f]{64}$/);
    const stored = (await q("select email_normalized,email_hash,token_hash,expires_at=created_at+interval '7 days' expiry_ok from trailer_invites where id=$1", [firstInvite.invite_id])).rows[0];
    assert.equal(stored.email_normalized, "candidate-a@example.test");
    assert.equal(stored.token_hash, await tokenHash(firstInvite.token));
    assert.notEqual(stored.token_hash, firstInvite.token);
    assert.equal(stored.expiry_ok, true);
  });

  await check("demo organizations cannot issue links or receive candidate attempts", async () => {
    await asUser(ids.demoLead, () =>
      assert.rejects(
        () => createInvites(ids.demoTrailer, ["candidate@example.test"]),
        rejects("demo_forbidden", "42501"),
      ),
    );
    await asService(() =>
      assert.rejects(
        () => q("insert into trailer_attempts(trailer_id,kind,label,submissions) values($1,'candidate','지원자 01',$2::jsonb)", [ids.demoTrailer, submissions]),
        rejects("demo_forbidden", "42501"),
      ),
    );
  });

  await check("only currently published and approved trailers keep issued links usable", async () => {
    await asUser(ids.lead, () =>
      assert.rejects(
        () => createInvites(ids.review, ["review@example.test"]),
        rejects("invite_unavailable", "P0001"),
      ),
    );
    await q("update trailers set status='unpublished' where id=$1", [ids.published]);
    assert.deepEqual((await openInvite(firstInvite.token, firstInvite.email)).rows[0].value, { error: "invite_unavailable" });
    await q("update trailers set status='published' where id=$1", [ids.published]);
  });

  await check("anonymous open returns only the public candidate payload and locks after ten mismatches", async () => {
    const opened = (await openInvite(firstInvite.token, firstInvite.email)).rows[0].value;
    assert.deepEqual(Object.keys(opened).sort(), ["apply_url", "consent_version", "expires_at", "org_display_name", "scenarios", "state"]);
    assert.equal(opened.state, "consent_required");
    for (const forbidden of ["dept_id", "org_id", "trailer_id", "decision_id"])
      assert.equal(Object.hasOwn(opened, forbidden), false);
    assert.equal((await q("select first_opened_at is not null opened from trailer_invites where id=$1", [firstInvite.invite_id])).rows[0].opened, true);

    let locked;
    await asUser(ids.lead, async () => {
      locked = (await createInvites(ids.published, ["locked@example.test"])).rows[0];
    });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      assert.deepEqual((await openInvite(locked.token, "wrong@example.test")).rows[0].value, { error: "invite_unavailable" });
    }
    assert.equal((await q("select open_failures from trailer_invites where id=$1", [locked.invite_id])).rows[0].open_failures, 10);
    assert.deepEqual((await openInvite(locked.token, locked.email)).rows[0].value, { error: "invite_unavailable" });
  });

  let submittedInvite;
  let submittedAttempt;
  await check("consent precedes one submission and atomically creates one candidate attempt and score job", async () => {
    await asUser(ids.lead, async () => {
      submittedInvite = (await createInvites(ids.published, ["submit@example.test"])).rows[0];
    });
    await asAnon(() =>
      assert.rejects(
        () => q("select * from submit_trailer_invite_attempt($1,$2,$3::jsonb)", [submittedInvite.token, submittedInvite.email, submissions]),
        rejects("consent_required", "P0001"),
      ),
    );
    await asAnon(() => q("select trailer_invite_consent($1,$2,'1')", [submittedInvite.token, submittedInvite.email]));
    await asAnon(async () => {
      submittedAttempt = (await q("select * from submit_trailer_invite_attempt($1,$2,$3::jsonb)", [submittedInvite.token, submittedInvite.email, submissions])).rows[0].attempt_id;
    });
    const attempt = (await q("select kind,label,invite_id from trailer_attempts where id=$1", [submittedAttempt])).rows[0];
    assert.equal(attempt.kind, "candidate");
    assert.match(attempt.label, /^지원자 \d+$/);
    assert.equal(attempt.label.includes("@"), false);
    assert.equal(attempt.invite_id, submittedInvite.invite_id);
    assert.equal((await q("select count(*)::int n from jobs where kind='score_trailer_attempt' and payload->>'attemptId'=$1", [submittedAttempt])).rows[0].n, 1);
    await asAnon(() =>
      assert.rejects(
        () => q("select * from submit_trailer_invite_attempt($1,$2,$3::jsonb)", [submittedInvite.token, submittedInvite.email, submissions]),
        rejects("already_submitted", "P0001"),
      ),
    );
    assert.equal((await q("select count(*)::int n from trailer_attempts where invite_id=$1", [submittedInvite.invite_id])).rows[0].n, 1);
  });

  await check("candidate withdrawal uses the common purge path and remains visible as metadata only", async () => {
    await asAnon(() => q("select withdraw_trailer_invite_attempt($1,$2)", [submittedInvite.token, submittedInvite.email]));
    assert.equal((await q("select count(*)::int n from trailer_attempts where id=$1", [submittedAttempt])).rows[0].n, 0);
    const stored = (await q("select email_normalized,email_hash,token_hash,used_token_hash,withdrawn_at from trailer_invites where id=$1", [submittedInvite.invite_id])).rows[0];
    assert.equal(stored.email_normalized, null);
    assert.equal(stored.email_hash, null);
    assert.ok(stored.token_hash.startsWith("void:"));
    assert.equal(stored.used_token_hash, await tokenHash(submittedInvite.token));
    assert.ok(stored.withdrawn_at);
    assert.deepEqual((await openInvite(submittedInvite.token, submittedInvite.email)).rows[0].value, { error: "invite_unavailable" });
    await asUser(ids.lead, async () => {
      const row = (await q("select * from list_trailer_invites($1) where invite_id=$2", [ids.published, submittedInvite.invite_id])).rows[0];
      assert.equal(row.status, "withdrawn");
      assert.equal(row.email, null);
    });
  });

  await check("only service_role can purge due invitations", async () => {
    let due;
    await asUser(ids.lead, async () => {
      due = (await createInvites(ids.published, ["purge@example.test"])).rows[0];
    });
    await q("update trailer_invites set purge_after=now()-interval '1 second' where id=$1", [due.invite_id]);
    await asAnon(() => assert.rejects(() => q("select purge_expired_trailer_invites()"), (error) => error.code === "42501"));
    await asUser(ids.lead, () => assert.rejects(() => q("select purge_expired_trailer_invites()"), (error) => error.code === "42501"));
    const purged = await asService(() => q("select purge_expired_trailer_invites() n"));
    assert.equal(purged.rows[0].n, 1);
    const row = (await q("select email_normalized,email_hash,purged_at from trailer_invites where id=$1", [due.invite_id])).rows[0];
    assert.equal(row.email_normalized, null);
    assert.equal(row.email_hash, null);
    assert.ok(row.purged_at);
  });

  await check("RLS exposes invitation emails only to the owning department lead", async () => {
    await asUser(ids.lead, async () => {
      const rows = await q("select email_normalized from trailer_invites where id=$1", [firstInvite.invite_id]);
      assert.equal(rows.rows[0].email_normalized, firstInvite.email);
    });
    for (const actor of [ids.member, ids.otherLead]) {
      await asUser(actor, async () => {
        assert.equal((await q("select id from trailer_invites where id=$1", [firstInvite.invite_id])).rows.length, 0);
      });
    }
    await asAnon(() => assert.rejects(() => q("select id from trailer_invites"), (error) => error.code === "42501"));
    await asUser(ids.member, () => assert.rejects(() => q("select * from list_trailer_invites($1)", [ids.published]), (error) => error.code === "42501"));
    for (const role of ["anon", "authenticated"])
      for (const command of ["INSERT", "UPDATE", "DELETE"])
        assert.equal((await q("select has_table_privilege($1,'trailer_invites',$2) allowed", [role, command])).rows[0].allowed, false);
  });

  await check("active-email dedupe, revocation replacement, and batch limits are enforced", async () => {
    let issued;
    await asUser(ids.lead, async () => {
      issued = (await createInvites(ids.published, ["same@example.test"])).rows[0];
      const skipped = (await createInvites(ids.published, ["SAME@example.test"])).rows[0];
      assert.equal(skipped.skipped_reason, "active_exists");
      await q("select revoke_trailer_invite($1)", [issued.invite_id]);
      const replacement = (await createInvites(ids.published, ["same@example.test"])).rows[0];
      assert.match(replacement.token, /^[0-9a-f]{64}$/);
      const duplicateRows = (await createInvites(ids.published, ["batch@example.test", "BATCH@example.test"])).rows;
      assert.equal(duplicateRows[1].skipped_reason, "duplicate");
      await assert.rejects(
        () => createInvites(ids.published, Array.from({ length: 21 }, (_, index) => `batch-${index}@example.test`)),
        rejects("invalid_invite_batch", "22023"),
      );
    });
  });

  await check("trailer deletion cascades invitations and failed candidate scoring alone can be requeued", async () => {
    let cascadeInvite;
    await asUser(ids.lead, async () => {
      cascadeInvite = (await createInvites(ids.cascadeTrailer, ["cascade@example.test"])).rows[0];
    });
    await q("delete from trailers where id=$1", [ids.cascadeTrailer]);
    assert.equal((await q("select count(*)::int n from trailer_invites where id=$1", [cascadeInvite.invite_id])).rows[0].n, 0);

    let retryInvite;
    await asUser(ids.lead, async () => {
      retryInvite = (await createInvites(ids.published, ["retry@example.test"])).rows[0];
    });
    await asAnon(() => q("select trailer_invite_consent($1,$2,'1')", [retryInvite.token, retryInvite.email]));
    let retryAttempt;
    await asAnon(async () => {
      retryAttempt = (await q("select * from submit_trailer_invite_attempt($1,$2,$3::jsonb)", [retryInvite.token, retryInvite.email, submissions])).rows[0].attempt_id;
    });
    await q("update trailer_attempts set status='scored',result='{}',weighted_score=3 where id=$1", [retryAttempt]);
    await asUser(ids.lead, () => assert.rejects(() => q("select requeue_trailer_attempt_score($1)", [retryAttempt]), rejects("attempt_not_requeueable", "P0001")));
    await q("update trailer_attempts set status='failed',status_reason='llm_timeout' where id=$1", [retryAttempt]);
    const before = (await q("select count(*)::int n from jobs where kind='score_trailer_attempt' and payload->>'attemptId'=$1", [retryAttempt])).rows[0].n;
    await asUser(ids.lead, () => q("select requeue_trailer_attempt_score($1)", [retryAttempt]));
    const attempt = (await q("select status,status_reason,result,weighted_score from trailer_attempts where id=$1", [retryAttempt])).rows[0];
    assert.deepEqual(attempt, { status: "scoring", status_reason: null, result: null, weighted_score: null });
    assert.equal((await q("select count(*)::int n from jobs where kind='score_trailer_attempt' and payload->>'attemptId'=$1", [retryAttempt])).rows[0].n, before + 1);
  });

  await check("new tables and functions have the exact API-role privilege matrix", async () => {
    const privateFunctions = [
      "private.guard_trailer_invite()",
      "private.trailer_invite_gate(uuid)",
      "private.trailer_invite_lookup(text,text)",
      "private.purge_trailer_invite(uuid,text)",
      "private.count_trailer_submission(uuid)",
    ];
    const authenticatedFunctions = [
      "public.create_trailer_invites(uuid,text[])",
      "public.revoke_trailer_invite(uuid)",
      "public.delete_trailer_invite(uuid)",
      "public.list_trailer_invites(uuid)",
      "public.requeue_trailer_attempt_score(uuid)",
    ];
    const candidateFunctions = [
      "public.trailer_invite_open(text,text)",
      "public.trailer_invite_consent(text,text,text)",
      "public.submit_trailer_invite_attempt(text,text,jsonb)",
      "public.withdraw_trailer_invite_attempt(text,text)",
    ];
    for (const signature of privateFunctions)
      for (const role of ["anon", "authenticated", "service_role"])
        assert.equal((await q("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, signature])).rows[0].allowed, false, `${role} ${signature}`);
    for (const signature of authenticatedFunctions)
      for (const role of ["anon", "authenticated", "service_role"])
        assert.equal((await q("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, signature])).rows[0].allowed, role === "authenticated", `${role} ${signature}`);
    for (const signature of candidateFunctions)
      for (const role of ["anon", "authenticated", "service_role"])
        assert.equal((await q("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, signature])).rows[0].allowed, role !== "service_role", `${role} ${signature}`);
    for (const role of ["anon", "authenticated", "service_role"])
      assert.equal((await q("select has_function_privilege($1,'public.purge_expired_trailer_invites()','EXECUTE') allowed", [role])).rows[0].allowed, role === "service_role");
  });

  await check("0040 rollback composes before 0028, 0027, and 0026 rollback", async () => {
    await db.exec("begin");
    try {
      await db.exec(readFileSync(resolve("supabase/rollback/0040_trailer_invites_down.sql"), "utf8"));
      assert.equal((await q("select to_regclass('public.trailer_invites') value")).rows[0].value, null);
      assert.equal((await q("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='trailer_attempts' and column_name='invite_id'")).rows[0].n, 0);
      await db.exec(readFileSync(resolve("supabase/rollback/0028_trailer_assessment_down.sql"), "utf8"));
      await db.exec(readFileSync(resolve("supabase/rollback/0027_trailer_publish_down.sql"), "utf8"));
      await db.exec(readFileSync(resolve("supabase/rollback/0026_org_admin_down.sql"), "utf8"));
      for (const table of ["trailer_attempts", "trailers", "member_invites"])
        assert.equal((await q("select to_regclass($1) value", [`public.${table}`])).rows[0].value, null);
    } finally {
      await db.exec("rollback");
    }
  });

  console.log(JSON.stringify({ passed, failed: 0, database: "isolated PGlite", migrations: "0001-0028 + 0040", excluded: ["0004_worker_cron.sql (pg_cron/pg_net unavailable)"] }));
} finally {
  await db.close();
}
