/**
 * Local-only verification for desktop companion E05~E13.
 * Fixture preparation uses the disposable local database; application calls
 * use web cookies or the linked device Bearer session and therefore exercise RLS.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
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
if (!/^http:\/\/(127\.0\.0\.1|localhost):/u.test(status.API_URL)) {
  throw new Error("local_supabase_required");
}

const idsPath = resolve(qaRoot, "ids.json");
const credentialsPath = resolve(qaRoot, "credentials.json");
if (!existsSync(idsPath) || !existsSync(credentialsPath)) {
  throw new Error("local_review_qa_setup_required");
}
const ids = JSON.parse(readFileSync(idsPath, "utf8"));
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const databaseUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
if (![ids.lead, ids.member, ids.dept, ids.other].every((id) => uuid.test(id))) {
  throw new Error("invalid_local_ids");
}

const baseUrl = "http://127.0.0.1:3011";
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

const fixture = {
  publicSource: randomUUID(),
  privateSource: randomUUID(),
  publicItem: randomUUID(),
  privateItem: randomUUID(),
  leadAnswer: randomUUID(),
  memberAnswer: randomUUID(),
  leadCard: randomUUID(),
  otherCard: randomUUID(),
  review: randomUUID(),
  memberReview: randomUUID(),
};
const publicQuote = "부서 공개 합성 근거입니다.";
const privateQuote = "팀장 전용 합성 근거입니다.";
const answerText = "확인된 합성 근거를 바탕으로 답합니다.";
const reviewBytes = new TextEncoder().encode(
  "합성 문서입니다. 외부 전송 없이 로컬 자료 처리만 확인합니다.",
);
const reviewFingerprint = createHash("sha256")
  .update(reviewBytes)
  .digest("hex");
const reviewPath = `${ids.dept}/${fixture.review}/original`;

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

function webCookie(session) {
  const projectRef = new URL(status.API_URL).hostname.split(".")[0];
  const value = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `sb-${projectRef}-auth-token=base64-${value}`;
}

async function waitForServer(child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null) throw new Error("local_dev_server_exited");
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
      execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
      });
    } catch {
      child.kill();
    }
    return;
  }
  child.kill("SIGTERM");
}

async function linkDevice(token, role) {
  const linked = await request("/api/companion/link", {
    method: "POST",
    headers: bearer(token, { "content-type": "application/json" }),
    body: JSON.stringify({
      dept_id: ids.dept,
      device_name: `Companion API QA ${role}`,
      app_version: "0.1.0",
    }),
  });
  assert.equal(linked.response.status, 201);
  assert.equal(linked.body.role, role);
  return linked.body.link_id;
}

async function waitForReviewJob() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const active = Number(
      q(`select count(*) from jobs j
        join review_parts p on p.id::text=j.payload->>'partId'
        where p.review_id='${fixture.review}'
          and j.status in ('queued','running');`),
    );
    if (active === 0) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
}

let devServer = null;
let leadLogin = null;
let memberLogin = null;
let serverOutput = "";
let fixturePrepared = false;
let leadLink = null;
let memberLink = null;
let llmCallsBefore = null;

try {
  q(`
    begin;
    update members set consented_at=now()
      where dept_id='${ids.dept}'
        and user_id in ('${ids.lead}','${ids.member}');
    insert into sources(id,dept_id,kind,external_id,title,visibility,active)
    values
      ('${fixture.publicSource}','${ids.dept}','document','companion-public-${fixture.publicSource}','공개 합성 자료','dept',true),
      ('${fixture.privateSource}','${ids.dept}','document','companion-private-${fixture.privateSource}','팀장 합성 자료','leads_only',true);
    insert into items(id,source_id,dept_id,content,author)
    values
      ('${fixture.publicItem}','${fixture.publicSource}','${ids.dept}','${publicQuote}','합성 작성자'),
      ('${fixture.privateItem}','${fixture.privateSource}','${ids.dept}','${privateQuote}','합성 팀장');
    insert into answers(id,dept_id,asked_by,question,answer,status,verified,refused,created_at)
    values
      ('${fixture.leadAnswer}','${ids.dept}','${ids.lead}','팀장 합성 질문','${answerText}','done',true,false,now()),
      ('${fixture.memberAnswer}','${ids.dept}','${ids.member}','팀원 합성 질문','${answerText}','done',true,false,now());
    insert into citations(owner_kind,owner_id,item_id,quote,ordinal)
    values
      ('answer','${fixture.leadAnswer}','${fixture.publicItem}','${publicQuote}',1),
      ('answer','${fixture.leadAnswer}','${fixture.privateItem}','${privateQuote}',2),
      ('answer','${fixture.memberAnswer}','${fixture.publicItem}','${publicQuote}',1);
    insert into decision_requests(id,dept_id,title,background,assignee_id,visibility,status,deadline)
    values
      ('${fixture.leadCard}','${ids.dept}','앱에서 확인할 합성 카드','합성 카드 배경','${ids.lead}','dept','open',now()+interval '1 day'),
      ('${fixture.otherCard}','${ids.other}','다른 부서 합성 카드','다른 부서 카드 배경','${ids.lead}','dept','open',now()+interval '1 day');
    commit;
    notify pgrst,'reload schema';
  `);
  fixturePrepared = true;
  llmCallsBefore = Number(q("select count(*) from llm_calls;"));

  if (!(await serverAlreadyRunning())) {
    devServer = spawn(process.execPath, ["scripts/review-qa.mjs", "dev"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const keepOutput = (chunk) => {
      serverOutput = `${serverOutput}${chunk.toString("utf8")}`.slice(-8_000);
    };
    devServer.stdout.on("data", keepOutput);
    devServer.stderr.on("data", keepOutput);
    await waitForServer(devServer);
  }

  leadLogin = await login("review-lead@example.test");
  memberLogin = await login("review-member@example.test");
  const leadToken = leadLogin.session.access_token;
  const memberToken = memberLogin.session.access_token;
  leadLink = await linkDevice(leadToken, "lead");
  memberLink = await linkDevice(memberToken, "member");

  const answerCases = [
    {
      id: fixture.leadAnswer,
      token: leadToken,
      session: leadLogin.session,
      hiddenQuote: null,
    },
    {
      id: fixture.memberAnswer,
      token: memberToken,
      session: memberLogin.session,
      hiddenQuote: privateQuote,
    },
  ];
  for (const answerCase of answerCases) {
    const web = await request(
      `/api/d/${ids.dept}/answers/${answerCase.id}`,
      { headers: { cookie: webCookie(answerCase.session) } },
    );
    const companion = await request(
      `/api/companion/answers/${answerCase.id}`,
      { headers: bearer(answerCase.token) },
    );
    assert.equal(web.response.status, 200);
    assert.equal(companion.response.status, 200);
    assert.deepEqual(companion.body, web.body);
    if (answerCase.hiddenQuote) {
      assert.equal(
        companion.body.citations.some(
          (citation) => citation.quote === answerCase.hiddenQuote,
        ),
        false,
      );
    }
  }

  const leadInbox = await request("/api/companion/inbox", {
    headers: bearer(leadToken),
  });
  assert.equal(leadInbox.response.status, 200);
  assert.ok(leadInbox.body.cards.some((card) => card.id === fixture.leadCard));
  assert.ok(
    leadInbox.body.answers.some((answer) => answer.id === fixture.leadAnswer),
  );
  assert.equal(
    leadInbox.body.answers.some((answer) => answer.id === fixture.memberAnswer),
    false,
  );
  assert.equal("question" in leadInbox.body.answers[0], false);
  assert.equal("background" in leadInbox.body.cards[0], false);

  const memberInbox = await request("/api/companion/inbox", {
    headers: bearer(memberToken),
  });
  assert.equal(memberInbox.response.status, 200);
  assert.ok(
    memberInbox.body.answers.some(
      (answer) => answer.id === fixture.memberAnswer,
    ),
  );
  assert.equal(
    memberInbox.body.answers.some((answer) => answer.id === fixture.leadAnswer),
    false,
  );
  assert.deepEqual(memberInbox.body.reviews, []);

  const crossDepartmentCard = await request(
    `/api/companion/cards/${fixture.otherCard}`,
    { headers: bearer(leadToken) },
  );
  assert.equal(crossDepartmentCard.response.status, 404);

  const forbiddenDecision = await request(
    `/api/companion/cards/${fixture.leadCard}/decide`,
    {
      method: "POST",
      headers: bearer(memberToken, { "content-type": "application/json" }),
      body: JSON.stringify({
        status: "decided",
        outcome: "팀원이 시도한 결과",
        rationale: "담당자가 아니므로 저장되면 안 됩니다.",
      }),
    },
  );
  assert.equal(forbiddenDecision.response.status, 403);

  const decisionBody = {
    status: "decided",
    outcome: "합성 견적을 승인합니다.",
    rationale: "앱 결정 멱등성을 확인합니다.",
  };
  const firstDecision = await request(
    `/api/companion/cards/${fixture.leadCard}/decide`,
    {
      method: "POST",
      headers: bearer(leadToken, { "content-type": "application/json" }),
      body: JSON.stringify(decisionBody),
    },
  );
  const duplicateDecision = await request(
    `/api/companion/cards/${fixture.leadCard}/decide`,
    {
      method: "POST",
      headers: bearer(leadToken, { "content-type": "application/json" }),
      body: JSON.stringify(decisionBody),
    },
  );
  assert.equal(firstDecision.response.status, 200);
  assert.equal(duplicateDecision.response.status, 200);
  assert.equal(duplicateDecision.body.duplicate, true);
  assert.equal(
    Number(
      q(
        `select count(*) from decisions where request_id='${fixture.leadCard}';`,
      ),
    ),
    1,
  );

  const memberTranscript = new FormData();
  memberTranscript.append(
    "file",
    new File(["합성 발언"], "member.txt", { type: "text/plain" }),
  );
  const forbiddenTranscript = await request("/api/companion/transcripts", {
    method: "POST",
    headers: bearer(memberToken),
    body: memberTranscript,
  });
  assert.equal(forbiddenTranscript.response.status, 403);

  const oversizedTranscript = await request("/api/companion/transcripts", {
    method: "POST",
    headers: bearer(leadToken, {
      "content-type": "application/octet-stream",
    }),
    body: new Uint8Array(4 * 1024 * 1024 + 1),
  });
  assert.equal(oversizedTranscript.response.status, 413);
  assert.equal(oversizedTranscript.body.code, "too_large");

  const memberReview = await request("/api/companion/reviews", {
    method: "POST",
    headers: bearer(memberToken, { "content-type": "application/json" }),
    body: JSON.stringify({
      id: fixture.memberReview,
      kind: "document",
      title: "팀원 등록 거부 자료",
      filename: "member.txt",
      size: reviewBytes.length,
      fingerprint: reviewFingerprint,
      duration: null,
      visibility: "dept",
      participants: [],
      synthetic: true,
      consent_confirmed: true,
    }),
  });
  assert.equal(memberReview.response.status, 403);

  const createdReview = await request("/api/companion/reviews", {
    method: "POST",
    headers: bearer(leadToken, { "content-type": "application/json" }),
    body: JSON.stringify({
      id: fixture.review,
      kind: "document",
      title: "앱 합성 검토 자료",
      filename: "companion.txt",
      size: reviewBytes.length,
      fingerprint: reviewFingerprint,
      duration: null,
      visibility: "dept",
      participants: [],
      synthetic: true,
      consent_confirmed: true,
    }),
  });
  assert.equal(createdReview.response.status, 201);
  assert.equal(createdReview.body.id, fixture.review);

  const uploaded = await leadLogin.client.storage
    .from("review-materials")
    .upload(reviewPath, reviewBytes, {
      contentType: "text/plain",
      upsert: false,
    });
  assert.equal(uploaded.error, null);

  const queuedPart = await request(
    `/api/companion/reviews/${fixture.review}/parts`,
    {
      method: "POST",
      headers: bearer(leadToken, { "content-type": "application/json" }),
      body: JSON.stringify({ index: 0 }),
    },
  );
  assert.equal(queuedPart.response.status, 202);
  assert.ok(databaseUuid.test(queuedPart.body.job_id));
  await waitForReviewJob();

  const revoked = await request("/api/companion/link", {
    method: "DELETE",
    headers: bearer(leadToken),
  });
  assert.equal(revoked.response.status, 204);

  const revokedCases = [
    ["/api/companion/inbox", { method: "GET" }],
    [
      "/api/companion/ask",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "해제 뒤 질문입니다." }),
      },
    ],
    [`/api/companion/answers/${fixture.leadAnswer}`, { method: "GET" }],
    ["/api/companion/questions", { method: "GET" }],
    [`/api/companion/cards/${fixture.leadCard}`, { method: "GET" }],
    [
      `/api/companion/cards/${fixture.leadCard}/decide`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(decisionBody),
      },
    ],
    ["/api/companion/transcripts", { method: "POST" }],
    ["/api/companion/reviews", { method: "POST" }],
    [
      `/api/companion/reviews/${fixture.review}/parts`,
      { method: "POST" },
    ],
  ];
  for (const [path, options] of revokedCases) {
    const headers = bearer(leadToken, options.headers ?? {});
    const response = await request(path, { ...options, headers });
    assert.equal(response.response.status, 401, path);
  }

  const llmCallsAfter = Number(q("select count(*) from llm_calls;"));
  assert.equal(llmCallsAfter, llmCallsBefore);

  console.log(
    JSON.stringify({
      answerParity: 2,
      memberLeadsOnlyCitations: 0,
      decisionRows: 1,
      crossDepartmentCard: 404,
      memberDecision: 403,
      inboxIsolation: true,
      memberTranscript: 403,
      oversizedTranscript: 413,
      memberReview: 403,
      reviewCreated: 201,
      reviewPart: 202,
      revokedRoutes: revokedCases.length,
      llmCalls: llmCallsAfter - llmCallsBefore,
      failed: 0,
    }),
  );
} catch (error) {
  if (serverOutput) process.stderr.write(`${serverOutput}\n`);
  throw error;
} finally {
  if (leadLogin) {
    await leadLogin.client.storage
      .from("review-materials")
      .remove([reviewPath])
      .catch(() => {});
  }
  if (memberLogin && memberLink) {
    await request("/api/companion/link", {
      method: "DELETE",
      headers: bearer(memberLogin.session.access_token),
    }).catch(() => {});
  }
  if (leadLogin) {
    await leadLogin.client.auth.signOut({ scope: "local" }).catch(() => {});
  }
  if (memberLogin) {
    await memberLogin.client.auth.signOut({ scope: "local" }).catch(() => {});
  }
  if (fixturePrepared) {
    q(`
      begin;
      delete from jobs where payload->>'partId' in (
        select id::text from review_parts where review_id='${fixture.review}'
      );
      delete from review_revisions where review_id='${fixture.review}';
      delete from review_parts where review_id='${fixture.review}';
      delete from reviewed_materials where id in ('${fixture.review}','${fixture.memberReview}');
      delete from citations where owner_id in (
        '${fixture.leadAnswer}','${fixture.memberAnswer}','${fixture.leadCard}','${fixture.otherCard}'
      );
      delete from decisions where request_id='${fixture.leadCard}';
      delete from decision_requests where id in ('${fixture.leadCard}','${fixture.otherCard}');
      delete from answers where id in ('${fixture.leadAnswer}','${fixture.memberAnswer}');
      delete from items where id in ('${fixture.publicItem}','${fixture.privateItem}');
      delete from sources where id in ('${fixture.publicSource}','${fixture.privateSource}');
      ${leadLink ? `delete from device_links where id='${leadLink}';` : ""}
      ${memberLink ? `delete from device_links where id='${memberLink}';` : ""}
      commit;
    `);
  }
  stopServer(devServer);
}
