// Local-only integration harness. No production migrations or user data.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { execFileSync, execSync, spawn } from "node:child_process";
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
nextEnv.loadEnvConfig(process.cwd());
const root = resolve(".vercel/review-qa");
mkdirSync(root, { recursive: true });
const info = JSON.parse(
  execSync("npx --yes supabase status --workdir .vercel/review-qa -o json", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(info.API_URL))
  throw new Error("local_supabase_required");
const secretPath = resolve(root, "credentials.json");
const credentials = existsSync(secretPath)
  ? JSON.parse(readFileSync(secretPath, "utf8"))
  : { password: randomBytes(24).toString("base64url") };
if (!existsSync(secretPath))
  writeFileSync(secretPath, JSON.stringify(credentials));
Object.assign(process.env, {
  NEXT_PUBLIC_SUPABASE_URL: info.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: info.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: info.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_APP_URL: "http://localhost:3011",
  E2E_BASE_URL: "http://localhost:3011",
  SEED_LEAD_EMAIL: "review-lead@example.test",
  SEED_LEAD_PASSWORD: credentials.password,
  SEED_ORG_ADMIN_EMAIL: "review-lead@example.test",
  SEED_ORG_ADMIN_PASSWORD: credentials.password,
  SEED_MEMBER_EMAIL: "review-member@example.test",
  SEED_MEMBER_PASSWORD: credentials.password,
  RECORDING_KEY_SECRET: createHash("sha256")
    .update(`review-qa-recording:${credentials.password}`)
    .digest("hex"),
  RECORDING_KEY_VERSION: "1",
  SASU_TEST_DOCKER_DB_CONTAINER: "supabase_db_review-qa",
  E2E_REVIEW_LIVE: "1",
  SASU_ORG_ADMIN_MODE: "on",
  SASU_RETRO_ENABLED: "true",
  SASU_DEMO_AUTO_LOGIN_ENABLED: "true",
  SASU_DEMO_USER_EMAIL: "judge-demo@demo.sasu.team",
  SASU_DEMO_USER_PASSWORD: credentials.password,
  SASU_TRAILER_PUBLISH_ENABLED: process.env.E2E_TRAILER_INVITES === "1" ? "true" : "false",
  SASU_TRAILER_INVITES_ENABLED: process.env.E2E_TRAILER_INVITES === "1" ? "true" : "false",
  SASU_TRAILER_SCORES_MODE: "off",
});
for (const key of [
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "SLACK_CLIENT_SECRET",
])
  delete process.env[key];
// Verify rejected signatures/jobs with local-only secrets; never accept live hooks.
process.env.SLACK_SIGNING_SECRET = credentials.password;
process.env.JOBS_TRIGGER_SECRET = credentials.password;
const command = process.argv[2] ?? "setup";
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
      "-q",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
if (command === "refresh-retro-connectors") {
  const sql=readFileSync("supabase/migrations/0050_retro_connection_boundaries.sql","utf8");
  const functions=sql.match(/create (?:or replace )?function [\s\S]*?\$\$;/g) ?? [];
  const permissions=sql.match(/(?:revoke all on function|grant execute on function) [\s\S]*?;/g) ?? [];
  const constraint=sql.match(/alter table public\.retro_activities add constraint retro_activities_kind_check[\s\S]*?;/)?.[0];
  if(functions.length<15||!constraint)throw Error("local_connector_schema_incomplete");
  q("begin;\nalter table public.retro_activities drop constraint retro_activities_kind_check;\n"+constraint+"\n"+functions.map(s=>s.replace(/^create function/,"create or replace function")).join("\n")+"\n"+permissions.join("\n")+"\ncommit;notify pgrst,'reload schema';");
  console.log("local retrospective connector functions refreshed");
} else if (command === "admin-auth") {
  const ids = JSON.parse(readFileSync(resolve(root, "ids.json"), "utf8"));
  if (![ids.org, ids.lead].every(id => /^[a-f0-9-]{36}$/.test(id))) throw Error("invalid_local_ids");
  q(`insert into org_admins(org_id,user_id,granted_by) values('${ids.org}','${ids.lead}','local-review-qa') on conflict do nothing;`);
  console.log("local organization administrator configured");
} else if (command === "demo-auth") {
  const client=createClient(info.API_URL,info.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const id="99999999-9999-4999-8999-999999999991";
  const existing=await client.auth.admin.getUserById(id);
  if(existing.error||existing.data.user?.email!=="judge-demo@demo.sasu.team")throw Error("local_demo_seed_required");
  const result=await client.auth.admin.updateUserById(id,{password:credentials.password});
  if(result.error)throw Error("local_demo_auth_setup_failed");
  console.log("local demo reviewer authentication configured");
} else if (command === "setup") {
  q(
    "create table if not exists public.review_qa_migrations(name text primary key); revoke all on public.review_qa_migrations from public,anon,authenticated;",
  );
  for (const name of readdirSync("supabase/migrations")
    .filter((n) => n.endsWith(".sql") && !n.startsWith("0004_"))
    .sort()) {
    const exists = execFileSync(
      "docker",
      [
        "exec",
        "supabase_db_review-qa",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-At",
        "-c",
        `select count(*) from public.review_qa_migrations where name='${name}'`,
      ],
      { encoding: "utf8" },
    ).trim();
    if (exists === "1") continue;
    q(
      "begin;\n" +
        readFileSync(resolve("supabase/migrations", name), "utf8") +
        `\ninsert into public.review_qa_migrations values('${name}'); commit;`,
    );
    console.log("applied", name);
  }
  const client = createClient(info.API_URL, info.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  // Local QA can exceed the API's default 50-user page after repeated runs.
  const users = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error("local_auth_unavailable");
  const ids = {};
  for (const role of ["lead", "member", "outsider"]) {
    const email = `review-${role}@example.test`;
    let user = users.data.users.find((u) => u.email === email);
    if (!user) {
      const result = await client.auth.admin.createUser({
        email,
        password: credentials.password,
        email_confirm: true,
      });
      if (result.error) throw new Error("local_user_create_failed");
      user = result.data.user;
    }
    ids[role] = user.id;
  }
  const org = "11111111-1111-4111-8111-111111111111",
    dept = "22222222-2222-4222-8222-222222222222",
    other = "22222222-2222-4222-8222-222222222223";
  q(`insert into orgs(id,name) values('${org}','자료 검토 합성 조직') on conflict do nothing;
    insert into departments(id,org_id,name) values('${dept}','${org}','자료 검토 QA'),('${other}','${org}','다른 부서 QA') on conflict do nothing;
    insert into members(user_id,dept_id,role,display_name,consented_at) values('${ids.lead}','${dept}','lead','합성 검토 팀장',now()),('${ids.member}','${dept}','member','합성 팀원',now()),('${ids.outsider}','${other}','lead','다른 부서장',now()) on conflict do nothing;
    notify pgrst,'reload schema';`);
  writeFileSync(
    resolve(root, "ids.json"),
    JSON.stringify({ ...ids, org, dept, other }, null, 2),
  );
  console.log(
    "local review QA ready; real transcription key present:",
    Boolean(process.env.GROQ_API_KEY),
  );
} else if (command === "refresh-review-schema") {
  const guard = q("select to_regprocedure('public.authorize_review_access(uuid,uuid,text)') is not null as guarded;");
  if (/\bt\b/.test(guard)) throw new Error("access_controls_installed_do_not_reapply_legacy_functions");
  // Reapply only functions/policies under development to the isolated QA DB.
  for (const name of [
    "0034_reviewed_materials.sql",
    "0035_record_retention.sql",
  ]) {
    const sql = readFileSync(resolve("supabase/migrations", name), "utf8");
    for (const match of sql.matchAll(/create function[\s\S]*?\$\$;/gi))
      q(match[0].replace(/^create function/i, "create or replace function"));
  }
  const reviewSchema = readFileSync(
    "supabase/migrations/0034_reviewed_materials.sql",
    "utf8",
  );
  q(
    "drop policy if exists reviews_read on public.reviewed_materials; " +
      reviewSchema.match(/create policy reviews_read[^;]+;/)[0],
  );
  q(
    "revoke all on function public.revoke_participant_reviews() from public,anon,authenticated,service_role; drop trigger if exists members_revoke_reviews on public.members; create trigger members_revoke_reviews after update of consented_at or delete on public.members for each row execute function public.revoke_participant_reviews(); update storage.buckets set file_size_limit=52428800 where id='review-materials'; notify pgrst,'reload schema';",
  );
  q("revoke all on function public.clear_inactive_document_summary(),public.fence_document_summary() from public,anon,authenticated,service_role; drop trigger if exists sources_clear_document_summary on public.sources; drop trigger if exists document_summary_fence on public.document_summaries; drop policy if exists document_summaries_active on public.document_summaries;");
  q(reviewSchema.match(/create trigger sources_clear_document_summary[^;]+;/)[0]+reviewSchema.match(/create trigger document_summary_fence[^;]+;/)[0]+reviewSchema.match(/create policy document_summaries_active[^;]+;/)[0]);
  console.log("local review functions refreshed");
} else if (command === "backup-test") {
  const { createBackup, verifyBackupRestore } =
    await import("./backup-vault.mjs");
  const actor = createClient(info.API_URL, info.ANON_KEY, {
    auth: { persistSession: false },
  });
  const login = await actor.auth.signInWithPassword({
    email: process.env.SEED_LEAD_EMAIL,
    password: credentials.password,
  });
  if (login.error) throw new Error("local_login_failed");
  const ids = JSON.parse(readFileSync(resolve(root, "ids.json"), "utf8"));
  const rid = randomUUID();
  const created = await actor.rpc("create_review", {
    p_dept: ids.dept,
    p_input: {
      id: rid,
      kind: "document",
      title: "백업 복원 합성 문서",
      filename: "backup.txt",
      size: 21,
      fingerprint: "b".repeat(64),
      duration: null,
      visibility: "leads_only",
      participants: [],
      synthetic: false,
      consent_confirmed: true,
    },
  });
  if (created.error) throw new Error("backup_fixture_failed");
  const upload = await actor.storage
    .from("review-materials")
    .upload(
      `${ids.dept}/${rid}/original`,
      Buffer.from("synthetic backup body"),
      { contentType: "text/plain" },
    );
  if (upload.error) throw new Error("backup_fixture_upload_failed");
  const queued = await actor.rpc("queue_review_part", {
    p_review: rid,
    p_index: 0,
  });
  if (queued.error) throw new Error("backup_fixture_queue_failed");
  const key = randomBytes(32).toString("hex");
  const path = resolve(root, `verification-${Date.now()}.sasubak`);
  const args = {
    container: "supabase_db_review-qa",
    key,
    url: info.API_URL,
    serviceKey: info.SERVICE_ROLE_KEY,
  };
  try {
    const backup = await createBackup({ ...args, output: path });
    await actor.rpc("review_action", {
      p_review: rid,
      p_revision: 1,
      p_action: "delete",
    });
    q(`update members set consented_at=null where user_id='${ids.member}';`);
    const restored = await verifyBackupRestore({ ...args, input: path });
    const counts = execFileSync(
      "docker",
      [
        "exec",
        "supabase_db_review-qa",
        "psql",
        "-U",
        "postgres",
        "-d",
        restored.database,
        "-At",
        "-c",
        `select count(*) from backup_verification.objects where name like '%/${rid}/%'; select count(*) from members where user_id='${ids.member}' and consented_at is not null;`,
      ],
      { encoding: "utf8" },
    ).trim();
    if (counts !== "0\n0")
      throw new Error("deletion_or_consent_restore_failed");
    const result = {
      backup,
      restored,
      deletedFileAbsent: true,
      withdrawnConsentPreserved: true,
    };
    mkdirSync("docs/verification/reviewed-materials-2026-09-16", {
      recursive: true,
    });
    writeFileSync(
      "docs/verification/reviewed-materials-2026-09-16/backup-results.json",
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error.message?.split("\n")[0],
        detail:
          typeof error.stderr === "string" ? error.stderr.slice(-700) : null,
      }),
    );
    process.exitCode = 1;
  } finally {
    q(`update members set consented_at=now() where user_id='${ids.member}';`);
  }
} else {
  const args =
    command === "dev"
      ? ["node_modules/next/dist/bin/next", "dev", "-p", "3011", ...process.argv.slice(3)]
      : command === "build"
        ? ["node_modules/next/dist/bin/next", "build", ...process.argv.slice(3)]
        : command === "start"
          ? ["node_modules/next/dist/bin/next", "start", "-p", "3011"]
          : command === "seed-demo"
            ? ["node_modules/tsx/dist/cli.mjs", "scripts/seed-demo.ts"]
            : command === "llm-style"
              ? ["node_modules/tsx/dist/cli.mjs", "scripts/sample-llm-style.ts"]
            : command === "plain-language-test"
              ? ["node_modules/@playwright/test/cli.js", "test", "tests/e2e/plain-language.spec.ts", ...process.argv.slice(3)]
            : command === "grounded-answer-test"
              ? ["node_modules/@playwright/test/cli.js", "test", "tests/e2e/grounded-answer-live.spec.ts", ...process.argv.slice(3)]
            : command === "connector-test"
              ? ["node_modules/@playwright/test/cli.js", "test", "tests/e2e/retro-connectors.spec.ts", ...process.argv.slice(3)]
            : command === "ui-regression"
              ? ["node_modules/@playwright/test/cli.js", "test", "guest.spec.ts", "demo-public-workspace.spec.ts", "demo-reviewer.spec.ts", "ui-refresh.spec.ts", "workspace-polish.spec.ts", "hiring-demo.spec.ts", "plain-language.spec.ts", "site.spec.ts", "security-headers.spec.ts", "review-state-recovery.spec.ts", ...process.argv.slice(3)]
            : command === "trailer-regression"
              ? ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.trailer.config.ts", ...process.argv.slice(3)]
            : command === "rls-test"
              ? ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.rls.config.ts"]
            : command === "audit-showcase"
              ? ["node_modules/tsx/dist/cli.mjs", "scripts/audit-showcase-data.ts"]
            : command === "access-test"
              ? ["scripts/verify-review-storage.mjs"]
            : command === "retention-test"
              ? ["node_modules/tsx/dist/cli.mjs", "scripts/verify-review-retention.ts"]
            : command === "recording-storage-test"
              ? ["node_modules/tsx/dist/cli.mjs", "scripts/verify-recording-storage.ts"]
            : command === "retention-browser-test"
              ? ["node_modules/@playwright/test/cli.js", "test", "tests/e2e/review-retention-live.spec.ts", ...process.argv.slice(3)]
            : command === "recording-product-test"
              ? ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.recording-product.config.ts", ...process.argv.slice(3)]
            : command === "sales-review-test"
              ? ["node_modules/@playwright/test/cli.js", "test", "tests/e2e/sales-review-local.spec.ts", ...process.argv.slice(3)]
            : command === "sales-review-revision-test"
              ? ["node_modules/@playwright/test/cli.js", "test", "tests/e2e/sales-review-revision-local.spec.ts", ...process.argv.slice(3)]
            : command === "sales-review-sources-test"
              ? ["node_modules/@playwright/test/cli.js", "test", "tests/e2e/sales-review-sources-local.spec.ts", ...process.argv.slice(3)]
            : command === "sales-review-compare-test"
              ? ["node_modules/@playwright/test/cli.js", "test", "tests/e2e/sales-review-literal-comparison-local.spec.ts", ...process.argv.slice(3)]
            : command === "sales-review-checklist-test"
              ? ["node_modules/@playwright/test/cli.js", "test", "tests/e2e/sales-review-condition-checklist-local.spec.ts", ...process.argv.slice(3)]
            : command === "csp-test"
              ? ["node_modules/@playwright/test/cli.js", "test", "tests/e2e/security-headers.spec.ts", ...process.argv.slice(3)]
            : [
                "node_modules/@playwright/test/cli.js",
                "test",
                command === "guest-test"
                  ? "tests/e2e/guest.spec.ts"
                  : command === "access-browser-test"
                    ? "tests/e2e/review-access-live.spec.ts"
                  : command === "retro-test"
                    ? "tests/e2e/retros.spec.ts"
                  : command === "candidate-test"
                    ? "tests/e2e/trailer-invites.spec.ts"
                  : command === "hiring-test"
                    ? "tests/e2e/hiring-demo.spec.ts"
                  : "tests/e2e/reviewed-materials.spec.ts",
                ...process.argv.slice(3),
              ];
  const child = spawn(process.execPath, args, {
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}
