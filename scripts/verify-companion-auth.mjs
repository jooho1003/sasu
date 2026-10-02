/**
 * Local-only API verification for desktop companion Bearer authentication.
 * The elevated client is limited to disposable fixture and OTP preparation;
 * application requests always use the access token and RLS.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const qaRoot = resolve(".vercel/review-qa");
const statusCommand =
  process.platform === "win32"
    ? [
        "cmd.exe",
        [
          "/d",
          "/s",
          "/c",
          "npx --yes supabase status --workdir .vercel/review-qa -o json",
        ],
      ]
    : [
        "npx",
        [
          "--yes",
          "supabase",
          "status",
          "--workdir",
          ".vercel/review-qa",
          "-o",
          "json",
        ],
      ];
const status = JSON.parse(
  execFileSync(statusCommand[0], statusCommand[1], { encoding: "utf8" }),
);
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(status.API_URL)) {
  throw new Error("local_supabase_required");
}

const idsPath = resolve(qaRoot, "ids.json");
const credentialsPath = resolve(qaRoot, "credentials.json");
if (!existsSync(idsPath) || !existsSync(credentialsPath)) {
  throw new Error("local_review_qa_setup_required");
}
const ids = JSON.parse(readFileSync(idsPath, "utf8"));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (![ids.lead, ids.member, ids.dept, ids.other].every((id) => uuid.test(id))) {
  throw new Error("invalid_local_ids");
}

const baseUrl = "http://127.0.0.1:3011";
const demoOrg = randomUUID();
const demoDept = randomUUID();
const authOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
const admin = createClient(
  status.API_URL,
  status.SERVICE_ROLE_KEY,
  authOptions,
);

const q = (sql) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_review-qa",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-q",
    ],
    { input: sql, encoding: "utf8" },
  ).trim();

async function login(email) {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  assert.equal(link.error, null);
  assert.ok(link.data.properties.email_otp);
  const client = createClient(status.API_URL, status.ANON_KEY, authOptions);
  const verified = await client.auth.verifyOtp({
    type: "email",
    email,
    token: link.data.properties.email_otp,
  });
  assert.equal(verified.error, null);
  assert.ok(verified.data.session?.access_token);
  return { client, session: verified.data.session };
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...options,
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { response, body };
}

function bearer(token, extra = {}) {
  return { authorization: `Bearer ${token}`, ...extra };
}

async function waitForServer(child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null) {
      throw new Error("local_dev_server_exited");
    }
    try {
      const response = await fetch(`${baseUrl}/api/companion/link`, {
        redirect: "manual",
      });
      if (response.status === 401) return;
    } catch {
      // The local server is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error("local_dev_server_timeout");
}

async function serverAlreadyRunning() {
  try {
    const response = await fetch(`${baseUrl}/api/companion/link`, {
      redirect: "manual",
    });
    return response.status === 401;
  } catch {
    return false;
  }
}

function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    try {
      execFileSync(
        "taskkill",
        ["/pid", String(child.pid), "/t", "/f"],
        { stdio: "ignore" },
      );
    } catch {
      child.kill();
    }
    return;
  }
  child.kill("SIGTERM");
}

let devServer = null;
let leadLogin = null;
let memberLogin = null;
let fixturePrepared = false;
let serverOutput = "";

try {
  q(`
    begin;
    insert into orgs(id,name,is_demo)
    values('${demoOrg}','기기 연결 금지 데모 조직',true)
    on conflict (id) do update set name=excluded.name,is_demo=true;
    insert into departments(id,org_id,name)
    values('${demoDept}','${demoOrg}','기기 연결 금지 데모 부서')
    on conflict (id) do update set org_id=excluded.org_id,name=excluded.name;
    insert into members(user_id,dept_id,role,display_name,consented_at)
    values('${ids.lead}','${demoDept}','lead','합성 검토 팀장',now())
    on conflict (user_id,dept_id) do update
      set role='lead',display_name='합성 검토 팀장',consented_at=now();
    update members set consented_at=now()
      where (user_id='${ids.lead}' or user_id='${ids.member}')
        and dept_id='${ids.dept}';
    commit;
    notify pgrst,'reload schema';
  `);
  fixturePrepared = true;

  if (!(await serverAlreadyRunning())) {
    devServer = spawn(
      process.execPath,
      ["scripts/review-qa.mjs", "dev"],
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    const keepOutput = (chunk) => {
      serverOutput = `${serverOutput}${chunk.toString("utf8")}`.slice(-4_000);
    };
    devServer.stdout.on("data", keepOutput);
    devServer.stderr.on("data", keepOutput);
    await waitForServer(devServer);
  }

  leadLogin = await login("review-lead@example.test");
  memberLogin = await login("review-member@example.test");
  const leadToken = leadLogin.session.access_token;
  const memberToken = memberLogin.session.access_token;
  const linkBody = {
    dept_id: ids.dept,
    device_name: "Local Windows QA",
    app_version: "0.1.0",
  };

  const noToken = await request("/api/companion/link");
  assert.equal(noToken.response.status, 401);
  assert.equal(noToken.body.code, "no_token");

  const cookieOnly = await request("/api/companion/link", {
    method: "POST",
    headers: {
      cookie: `sasu-local-session=${leadToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(linkBody),
  });
  assert.equal(cookieOnly.response.status, 401);
  assert.equal(cookieOnly.body.code, "no_token");

  const leadDepartments = await request("/api/companion/departments", {
    headers: bearer(leadToken),
  });
  assert.equal(leadDepartments.response.status, 200);
  assert.ok(
    leadDepartments.body.departments.some(
      (department) =>
        department.id === ids.dept &&
        department.role === "lead" &&
        department.consented === true,
    ),
  );

  const memberDepartments = await request("/api/companion/departments", {
    headers: bearer(memberToken),
  });
  assert.equal(memberDepartments.response.status, 200);
  assert.ok(
    memberDepartments.body.departments.some(
      (department) =>
        department.id === ids.dept && department.role === "member",
    ),
  );

  const otherDepartment = await request("/api/companion/link", {
    method: "POST",
    headers: bearer(leadToken, { "content-type": "application/json" }),
    body: JSON.stringify({ ...linkBody, dept_id: ids.other }),
  });
  assert.equal(otherDepartment.response.status, 403);
  assert.equal(otherDepartment.body.code, "forbidden");

  const demoDepartment = await request("/api/companion/link", {
    method: "POST",
    headers: bearer(leadToken, { "content-type": "application/json" }),
    body: JSON.stringify({ ...linkBody, dept_id: demoDept }),
  });
  assert.equal(demoDepartment.response.status, 403);
  assert.equal(demoDepartment.body.code, "forbidden");

  const linked = await request("/api/companion/link", {
    method: "POST",
    headers: bearer(leadToken, { "content-type": "application/json" }),
    body: JSON.stringify(linkBody),
  });
  assert.equal(linked.response.status, 201);
  assert.equal(linked.body.dept.id, ids.dept);
  assert.equal(linked.body.role, "lead");
  assert.ok(uuid.test(linked.body.link_id));

  const context = await request("/api/companion/link", {
    headers: bearer(leadToken),
  });
  assert.equal(context.response.status, 200);
  assert.equal(context.body.link_id, linked.body.link_id);
  assert.equal(context.body.dept.id, ids.dept);

  const revoked = await request("/api/companion/link", {
    method: "DELETE",
    headers: bearer(leadToken),
  });
  assert.equal(revoked.response.status, 204);
  assert.equal(revoked.body, null);

  const revokedContext = await request("/api/companion/link", {
    headers: bearer(leadToken),
  });
  assert.equal(revokedContext.response.status, 401);

  const rejectedUser = await leadLogin.client.auth.getUser(leadToken);
  assert.ok(rejectedUser.error);
  assert.equal(rejectedUser.data.user, null);

  const webAsk = await request(`/api/d/${ids.dept}/ask`, {
    method: "POST",
    headers: bearer(memberToken, { "content-type": "application/json" }),
    body: JSON.stringify({ question: "Bearer 경계 확인 질문입니다." }),
  });
  assert.notEqual(webAsk.response.status, 202);
  assert.ok(
    webAsk.response.status === 401 ||
      webAsk.response.status === 302 ||
      webAsk.response.status === 303 ||
      webAsk.response.status === 307 ||
      webAsk.response.status === 308,
  );

  console.log(
    JSON.stringify({
      noToken: 401,
      cookieOnly: 401,
      departments: 200,
      linked: 201,
      nonmember: 403,
      demo: 403,
      context: 200,
      revoked: 204,
      revokedContext: 401,
      authSessionRejected: true,
      webBearerAccepted: false,
      failed: 0,
    }),
  );
} catch (error) {
  if (serverOutput) {
    process.stderr.write(`${serverOutput}\n`);
  }
  throw error;
} finally {
  if (leadLogin) {
    await leadLogin.client.auth.signOut({ scope: "local" }).catch(() => {});
  }
  if (memberLogin) {
    await memberLogin.client.auth.signOut({ scope: "local" }).catch(() => {});
  }
  if (fixturePrepared) {
    q(`
      delete from members where user_id='${ids.lead}' and dept_id='${demoDept}';
      delete from departments where id='${demoDept}';
      delete from orgs where id='${demoOrg}';
    `);
  }
  stopServer(devServer);
}
