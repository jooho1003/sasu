// Invoked by `node scripts/review-qa.mjs access-test`. Local Supabase only; no LLM.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(url) || process.env.E2E_REVIEW_LIVE !== "1") throw new Error("isolated_local_supabase_required");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const org = randomUUID(), dept = randomUUID(), rid = randomUUID(), doc = randomUUID();
const password = randomBytes(32).toString("base64url");
const email = `access-${randomUUID()}@example.test`;
function ok(result, stage) { if (result.error) throw new Error(`${stage}:${result.error.code ?? result.error.statusCode ?? "failed"}`); return result.data; }
ok(await admin.from("orgs").insert({ id: org, name: "원본 보호 격리 QA" }), "org");
ok(await admin.from("departments").insert({ id: dept, org_id: org, name: "합성 자료" }), "dept");
const user = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "user").user;
ok(await admin.from("members").insert({ dept_id: dept, user_id: user.id, role: "lead", display_name: "합성 사용자", consented_at: new Date().toISOString() }), "member");
ok(await admin.from("org_admins").insert({ org_id: org, user_id: user.id, granted_by: "isolated access QA" }), "admin");
const actor = createClient(url, anonKey, options);
const session = ok(await actor.auth.signInWithPassword({ email, password }), "login").session;
const storage = (ticket) => createClient(url, anonKey, { ...options, global: { headers: { Authorization: `Bearer ${session.access_token}`, "x-sasu-review-access": ticket } } }).storage.from("review-materials");
const authorize = async (id, action) => ok(await actor.rpc("authorize_review_access", { p_dept: dept, p_review: id, p_action: action }), "authorize");
let checks = 0;
try {
  for (const [id, kind] of [[rid, "audio"], [doc, "document"]]) {
    ok(await actor.rpc("create_review", { p_dept: dept, p_input: { id, kind, title: "합성 보안 검증", filename: kind === "audio" ? "sample.wav" : "sample.txt", size: 44, fingerprint: "c".repeat(64), duration: kind === "audio" ? 1 : null, visibility: "dept", participants: [], synthetic: true, consent_confirmed: true } }), "create_review");
    ok(await actor.storage.from("review-materials").upload(`${dept}/${id}/original`, Buffer.from("synthetic access control fixture"), { contentType: kind === "audio" ? "audio/wav" : "text/plain" }), "insert_only_upload");
  }
  checks++;
  const path = `${dept}/${rid}/original`;
  assert.ok((await actor.storage.from("review-materials").download(path)).error); checks++;
  const grant = await authorize(rid, "play_original");
  assert.ok((await storage(grant.token).createSignedUrl(path, 86400)).error); checks++;
  const data = ok(await storage(grant.token).download(path), "storage_header_operation_single_use");
  assert.equal(await data.text(), "synthetic access control fixture"); checks++;
  assert.ok((await storage(grant.token).download(path)).error); checks++;
  assert.ok((await actor.rpc("authorize_review_access", { p_dept: dept, p_review: doc, p_action: "download_original" })).error); checks++;
  ok(await actor.rpc("admin_set_review_settings", { p_recording: false, p_download: true }), "enable_download");
  const documentGrant = await authorize(doc, "download_original");
  ok(await storage(documentGrant.token).download(documentGrant.path), "document_download"); checks++;
  const issued = ok(await actor.from("review_access_events").select("id").eq("actor_id", user.id), "count").length;
  const parallel = await Promise.all(Array.from({ length: 61 }, () => actor.rpc("authorize_review_access", { p_dept: dept, p_review: rid, p_action: "play_original" })));
  assert.equal(parallel.filter(result => !result.error).length, 60 - issued);
  assert.ok(parallel.filter(result => result.error).every(result => result.error.code === "P0001" && result.error.message === "rate_limited")); checks++;
  console.log(JSON.stringify({ checks, failed: 0, storage: "real local Supabase", concurrent_requests: 61, llm_calls: 0 }));
} finally {
  // Only this run's synthetic originals are removed; append-only audit rows remain in QA.
  for (const id of [rid, doc]) {
    await actor.rpc("review_action", { p_review: id, p_revision: 1, p_action: "delete" });
    await admin.storage.from("review-materials").remove([`${dept}/${id}/original`]);
  }
  await actor.auth.signOut();
}
