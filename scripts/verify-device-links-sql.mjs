// Isolated SQL scenarios; no environment files, production data or network.
import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

export async function verifyDeviceLinksSql({ q, check }) {
  const a = Object.fromEntries(["org", "dept", "other", "lead", "member", "outsider", "unconsented", "demoOrg", "demoDept"].map(k => [k, randomUUID()]));
  const demo = "99999999-9999-4999-8999-999999999991";
  await q("insert into orgs(id,name,is_demo) values($1,'Device QA',false),($2,'Device demo',true)", [a.org,a.demoOrg]);
  await q("insert into departments(id,org_id,name) values($1,$2,'Device QA'),($3,$2,'Other device QA'),($4,$5,'Demo device QA')", [a.dept,a.org,a.other,a.demoDept,a.demoOrg]);
  for (const user of [a.lead,a.member,a.outsider,a.unconsented,demo]) await q("insert into auth.users(id) values($1) on conflict do nothing", [user]);
  await q("insert into members(user_id,dept_id,role,display_name,consented_at) values($1,$5,'lead','Lead',now()),($2,$5,'member','Member',now()),($3,$6,'member','Other',now()),($4,$5,'member','No consent',null),($7,$5,'member','Demo',now()),($1,$8,'lead','Demo org lead',now())", [a.lead,a.member,a.outsider,a.unconsented,a.dept,a.other,demo,a.demoDept]);
  const session = async user => {
    const id = randomUUID();
    await q("insert into auth.sessions(id,user_id) values($1,$2)", [id,user]);
    return id;
  };
  const asDevice = async (user, sid, fn) => {
    await q("set role authenticated");
    await q("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({sub:user,role:"authenticated",session_id:sid})]);
    try { return await fn(); } finally {
      await q("reset role");
      await q("select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false),set_config('request.jwt.claims','{}',false)");
    }
  };
  const link = async (user,sid,dept=a.dept) => asDevice(user,sid,async () => (await q("select link_device($1,'Windows QA','0.1.0') id", [dept])).rows[0].id);
  const leadSession = await session(a.lead);
  const memberSession = await session(a.member);
  let leadLink = await link(a.lead,leadSession);
  const memberLink = await link(a.member,memberSession);

  await check("device links: own SELECT, other users invisible, direct writes denied", async () => {
    await asDevice(a.member,memberSession,async () => {
      assert.deepEqual((await q("select id from device_links order by id")).rows, [{id:memberLink}]);
      assert.equal((await q("select id from device_links where id=$1", [leadLink])).rows.length,0);
      for (const sql of ["insert into device_links default values", "update device_links set device_name='forged'", "delete from device_links"]) {
        await assert.rejects(() => q(sql), e => e.code === "42501");
      }
    });
  });
  await check("device links: nonmember, missing consent, demo org/account and missing session denied", async () => {
    for (const [user,dept] of [[a.outsider,a.dept],[a.unconsented,a.dept],[a.lead,a.demoDept],[demo,a.dept]]) {
      const sid = await session(user);
      await assert.rejects(() => link(user,sid,dept), e => e.code === "42501");
    }
    await assert.rejects(() => link(a.lead,null), e => e.code === "22023");
    await assert.rejects(() => link(a.lead,randomUUID()), e => e.code === "42501");
    await assert.rejects(() => link(a.member,leadSession), e => e.code === "42501");
  });
  await check("device links: sixth connection denied; relinking at limit keeps five", async () => {
    for(let i=1;i<5;i++) await link(a.lead,await session(a.lead));
    const sixth = await session(a.lead);
    await assert.rejects(() => link(a.lead,sixth), e => e.code === "P0001" && e.message === "device_link_limit");
    const replacement = await link(a.lead,leadSession);
    assert.notEqual(replacement,leadLink);
    assert.equal((await q("select count(*)::int n from device_links where user_id=$1 and revoked_at is null", [a.lead])).rows[0].n,5);
    assert.equal((await q("select revoked_reason from device_links where id=$1", [leadLink])).rows[0].revoked_reason,"relink");
    leadLink = replacement;
  });

  await check("device links: same session replaces old link without deleting auth session", async () => {
    const replacement = await link(a.member,memberSession);
    assert.notEqual(replacement,memberLink);
    assert.equal((await q("select revoked_reason from device_links where id=$1", [memberLink])).rows[0].revoked_reason,"relink");
    assert.equal((await q("select id from auth.sessions where id=$1", [memberSession])).rows.length,1);
  });
  await check("device links: current membership/role and five-minute activity throttle", async () => {
    const id = (await q("select id from device_links where auth_session_id=$1 and revoked_at is null", [memberSession])).rows[0].id;
    await q("update device_links set last_seen_at=now()-interval '6 minutes' where id=$1", [id]);
    await asDevice(a.member,memberSession,async () => {
      const row = (await q("select * from companion_context()")).rows[0];
      assert.equal(row.dept_id,a.dept); assert.equal(row.role,"member");
    });
    const seen = (await q("select last_seen_at::text t from device_links where id=$1", [id])).rows[0].t;
    await asDevice(a.member,memberSession,() => q("select * from companion_context()"));
    assert.equal((await q("select last_seen_at::text t from device_links where id=$1", [id])).rows[0].t, seen);
    await q("update members set role='lead' where user_id=$1 and dept_id=$2", [a.member,a.dept]);
    await asDevice(a.member,memberSession,async () => assert.equal((await q("select * from companion_context()")).rows[0].role,"lead"));
  });
  await check("device links: removed membership revokes and returns zero rows", async () => {
    const sid = await session(a.member);
    const id = await link(a.member,sid);
    await q("delete from members where user_id=$1 and dept_id=$2", [a.member,a.dept]);
    await asDevice(a.member,sid,async () => assert.equal((await q("select * from companion_context()")).rows.length,0));
    assert.equal((await q("select revoked_reason from device_links where id=$1", [id])).rows[0].revoked_reason,"membership");
  });
  await check("device links: only owner revokes; web and self signout delete matching session", async () => {
    await asDevice(a.outsider,await session(a.outsider),async () => assert.equal((await q("select revoke_device_link($1) result", [leadLink])).rows[0].result,false));
    assert.equal((await q("select id from auth.sessions where id=$1", [leadSession])).rows.length,1);
    await asDevice(a.lead,null,async () => assert.equal((await q("select revoke_device_link($1) result", [leadLink])).rows[0].result,true));
    assert.equal((await q("select id from auth.sessions where id=$1", [leadSession])).rows.length,0);
    assert.equal((await q("select revoked_reason from device_links where id=$1", [leadLink])).rows[0].revoked_reason,"user");
    const sid=await session(a.lead), id=await link(a.lead,sid);
    await asDevice(a.lead,sid,async () => {
      assert.equal((await q("select revoke_device_link($1) result", [id])).rows[0].result,true);
      assert.equal((await q("select revoke_device_link($1) result", [id])).rows[0].result,false);
      assert.equal((await q("select * from companion_context()")).rows.length,0);
    });
    assert.equal((await q("select revoked_reason from device_links where id=$1", [id])).rows[0].revoked_reason,"signout");
    assert.equal((await q("select id from auth.sessions where id=$1", [sid])).rows.length,0);
  });
  await check("device links: exact RPC privileges and revoked-state constraint", async () => {
    for(const name of ["public.link_device(uuid,text,text)","public.companion_context()","public.revoke_device_link(uuid)","private.current_session_id()"]) {
      for(const role of ["anon","authenticated","service_role"]) {
        assert.equal((await q("select has_function_privilege($1,$2,'execute') allowed", [role,name])).rows[0].allowed, role === "authenticated" && !name.startsWith("private."), `${role} ${name}`);
      }
      assert.equal((await q("select exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) a where p.oid=$1::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') allowed", [name])).rows[0].allowed,false);
    }
    await assert.rejects(() => q("update device_links set revoked_reason=null where id=$1", [leadLink]), e => e.code === "23514");
  });
}

async function verifyLocalDeviceLink() {
  const { createClient } = await import("@supabase/supabase-js");
  const info = JSON.parse(execSync(
    "npx --yes supabase status --workdir .vercel/review-qa -o json",
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ));
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(info.API_URL)) {
    throw new Error("local_supabase_required");
  }

  const ids = JSON.parse(readFileSync(".vercel/review-qa/ids.json", "utf8"));
  const credentials = JSON.parse(readFileSync(".vercel/review-qa/credentials.json", "utf8"));
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(ids.dept) || !uuid.test(ids.lead)) throw new Error("invalid_local_ids");

  const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(info.API_URL, info.SERVICE_ROLE_KEY, authOptions);
  const device = createClient(info.API_URL, info.ANON_KEY, authOptions);
  const web = createClient(info.API_URL, info.ANON_KEY, authOptions);
  const q = sql => execFileSync(
    "docker",
    ["exec", "-i", "supabase_db_review-qa", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-q"],
    { input: sql, encoding: "utf8" },
  ).trim();
  const sessionId = token => JSON.parse(Buffer.from(token.split(".")[1], "base64url")).session_id;

  const email = "review-lead@example.test";
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  assert.equal(link.error, null);
  const login = await device.auth.verifyOtp({
    email,
    token: link.data.properties.email_otp,
    type: "email",
  });
  assert.equal(login.error, null);
  const deviceSession = sessionId(login.data.session.access_token);
  let webSession;
  let linkId;

  try {
    const linked = await device.rpc("link_device", {
      p_dept: ids.dept,
      p_device_name: "Local Windows QA",
      p_app_version: "0.1.0",
    });
    assert.equal(linked.error, null);
    linkId = linked.data;

    const context = await device.rpc("companion_context");
    assert.equal(context.error, null);
    assert.equal(context.data[0].dept_id, ids.dept);
    assert.equal(context.data[0].link_id, linkId);

    const webLogin = await web.auth.signInWithPassword({ email, password: credentials.password });
    assert.equal(webLogin.error, null);
    webSession = sessionId(webLogin.data.session.access_token);
    const revoked = await web.rpc("revoke_device_link", { p_link: linkId });
    assert.equal(revoked.error, null);
    assert.equal(revoked.data, true);
    assert.equal(q(`select not exists(select 1 from auth.sessions where id='${deviceSession}');`), "t");
    assert.equal(q(`select revoked_reason from device_links where id='${linkId}' and user_id='${ids.lead}';`), "user");

    const getUser = await device.auth.getUser(login.data.session.access_token);
    assert.ok(getUser.error);
    assert.equal(getUser.data.user, null);
    const raw = await fetch(`${info.API_URL}/auth/v1/user`, {
      headers: { apikey: info.ANON_KEY, Authorization: `Bearer ${login.data.session.access_token}` },
    });
    const error = await raw.json();
    assert.equal(raw.status, 403);
    assert.equal(error.error_code ?? error.code, "session_not_found");
    const refresh = await createClient(info.API_URL, info.ANON_KEY, authOptions).auth.refreshSession({
      refresh_token: login.data.session.refresh_token,
    });
    assert.ok(refresh.error);
    assert.equal(refresh.data.session, null);

    console.log(JSON.stringify({
      localUrl: info.API_URL,
      linked: true,
      currentContext: true,
      webRevoked: true,
      sessionDeleted: true,
      rawAuthStatus: raw.status,
      rawAuthCode: error.error_code ?? error.code,
      sdkErrorName: getUser.error.name,
      refreshRejected: true,
      rpcOwner: q("select pg_get_userbyid(proowner) from pg_proc where oid='public.revoke_device_link(uuid)'::regprocedure;"),
      failed: 0,
    }));
  } finally {
    if (linkId) q(`delete from device_links where id='${linkId}' and user_id='${ids.lead}';`);
    q(`delete from auth.sessions where id in ('${deviceSession}'${webSession ? `,'${webSession}'` : ""}) and user_id='${ids.lead}';`);
    await web.auth.signOut({ scope: "local" });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--local") {
    await verifyLocalDeviceLink();
    process.exit(0);
  }
  const require = createRequire(resolve(process.argv[2] ?? resolve(tmpdir(), "sasu-pglite-phase36"), "package.json"));
  const { PGlite } = require("@electric-sql/pglite");
  const db = new PGlite();
  let passed=0;
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema private; revoke all on schema private from public;
      create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key,user_id uuid);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      create table orgs(id uuid primary key,name text,is_demo boolean not null default false);
      create table departments(id uuid primary key,org_id uuid references orgs,name text);
      create table members(user_id uuid references auth.users,dept_id uuid references departments,role text,display_name text,consented_at timestamptz,primary key(user_id,dept_id));`);
    await db.exec(readFileSync("supabase/migrations/0069_device_links.sql","utf8"));
    await verifyDeviceLinksSql({q:(sql,args=[]) => db.query(sql,args),check:async (name,fn) => {await fn();passed++;console.log(`PASS ${name}`);}});
    await db.exec(readFileSync("supabase/rollback/0069_device_links_down.sql","utf8"));
    assert.equal((await db.query("select to_regclass('public.device_links') value")).rows[0].value,null);
    for(const name of ["public.link_device(uuid,text,text)","public.companion_context()","public.revoke_device_link(uuid)","private.current_session_id()"]) {
      assert.equal((await db.query("select to_regprocedure($1) value",[name])).rows[0].value,null);
    }
    console.log(JSON.stringify({passed,failed:0,rollback:true,database:"isolated PGlite"}));
  } finally {await db.close();}
}
