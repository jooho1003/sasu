/**
 * Local-only evidence for desktop companion design gates G1 and G2.
 * This script intentionally uses the service role only to create a disposable
 * OTP session; it is never imported by application code.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = resolve(".vercel/review-qa");
const qaWorkdir = ".vercel/review-qa";
const statusCommand = process.platform === "win32"
  ? ["cmd.exe", ["/d", "/s", "/c", `npx --yes supabase status --workdir ${qaWorkdir} -o json`]]
  : ["npx", ["--yes", "supabase", "status", "--workdir", qaWorkdir, "-o", "json"]];
const status = JSON.parse(execFileSync(statusCommand[0], statusCommand[1], { encoding: "utf8" }));
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(status.API_URL)) {
  throw new Error("local_supabase_required");
}

const credentialsPath = resolve(root, "credentials.json");
const idsPath = resolve(root, "ids.json");
if (!existsSync(credentialsPath) || !existsSync(idsPath)) {
  throw new Error("local_review_qa_setup_required");
}
const ids = JSON.parse(readFileSync(idsPath, "utf8"));
const email = "review-lead@example.test";
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const anon = createClient(status.API_URL, status.ANON_KEY, {
  auth: { persistSession: false },
});
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
const jwtPayload = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));

const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (link.error || !link.data.properties.email_otp) throw new Error("otp_generate_failed");
const login = await anon.auth.verifyOtp({
  type: "email",
  email,
  token: link.data.properties.email_otp,
});
if (login.error || !login.data.session?.access_token) throw new Error("otp_verify_failed");
const token = login.data.session.access_token;
const payload = jwtPayload(token);
if (typeof payload.session_id !== "string") throw new Error("session_id_missing");
const sessionId = payload.session_id;
const sessionExists = q(`select exists(select 1 from auth.sessions where id='${sessionId}' and user_id='${ids.lead}');`);
if (sessionExists !== "t") throw new Error("session_id_not_in_auth_sessions");

const ownerAndPrivilege = q(
  "select (select tableowner from pg_tables where schemaname='auth' and tablename='sessions') || '|' || has_table_privilege('postgres','auth.sessions','DELETE');",
);
const [owner, canDelete] = ownerAndPrivilege.split("|");
if (!["t", "true"].includes(canDelete)) throw new Error("postgres_cannot_delete_auth_sessions");

const deletedInRollback = q(`
begin;
create function public.verify_companion_session_delete(p_session uuid)
returns boolean language plpgsql security definer set search_path = auth, public, pg_temp as $$
begin
  delete from auth.sessions where id = p_session and user_id = auth.uid();
  return found;
end;
$$;
revoke all on function public.verify_companion_session_delete(uuid) from public;
grant execute on function public.verify_companion_session_delete(uuid) to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${ids.lead}', true);
select public.verify_companion_session_delete('${sessionId}');
rollback;
`);
if (!deletedInRollback.endsWith("t")) throw new Error("security_definer_delete_failed");

const beforeDelete = await anon.auth.getUser(token);
if (beforeDelete.error) throw new Error("token_invalid_before_delete");
const deleted = q(`delete from auth.sessions where id='${sessionId}' and user_id='${ids.lead}' returning id;`);
if (deleted !== sessionId) throw new Error("session_delete_failed");
const afterDelete = await anon.auth.getUser(token);
if (!afterDelete.error || afterDelete.error.code !== "session_not_found") {
  console.log(JSON.stringify({
    G2: {
      status: "FAIL",
      deletedSessionGetUserErrorCode: afterDelete.error?.code ?? null,
      deletedSessionReturnedUser: Boolean(afterDelete.data.user),
    },
  }));
  throw new Error("session_not_found_not_enforced");
}

const unknown = `companion-missing-${Date.now()}@example.test`;
const missing = await anon.auth.signInWithOtp({ email: unknown, options: { shouldCreateUser: false } });
if (!missing.error) throw new Error("should_create_user_false_not_enforced");

console.log(JSON.stringify({
  localUrl: status.API_URL,
  G1: { status: "PASS", authSessionsOwner: owner, postgresDeletePrivilege: true, securityDefinerRollbackDelete: true },
  G2: { status: "PASS", otpLogin: true, sessionIdMatches: true, deletedSessionRejected: true, missingUserRejected: true },
}));
