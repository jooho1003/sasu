// Real local Postgres + Storage + production purge handler. No provider calls.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { purgeReviewFiles } from "@/lib/pipeline/review-material";
import { encodeMonoWav } from "@/lib/adapters/review-audio";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(url) || process.env.E2E_REVIEW_LIVE !== "1")
    throw new Error("isolated_local_supabase_required");
  const origin = new URL(url).origin;
  const originalFetch = globalThis.fetch;
  let externalRequests = 0;
  globalThis.fetch = (input, init) => {
    const target = new URL(input instanceof Request ? input.url : String(input));
    if (target.origin !== origin) {
      externalRequests++;
      throw new Error("external_request_forbidden");
    }
    return originalFetch(input, init);
  };
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, options);
  const actor = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, options);
  function ok<R extends { data: unknown; error: unknown }>(result: R, stage: string): NonNullable<R["data"]> {
    if (result.error || result.data === null) throw new Error(`${stage}_failed`);
    return result.data as NonNullable<R["data"]>;
  }
  function written(result: { error: unknown }, stage: string) {
    if (result.error) throw new Error(stage);
  }
  const org = randomUUID(), dept = randomUUID(), manualDept = randomUUID();
  const email = `retention-${randomUUID()}@example.test`, password = randomBytes(32).toString("base64url");
  const cases = [
    { id: randomUUID(), dept, kind: "audio", expired: true, confirmed: true },
    { id: randomUUID(), dept, kind: "document", expired: true, confirmed: true },
    { id: randomUUID(), dept: manualDept, kind: "audio", expired: false, confirmed: true },
    { id: randomUUID(), dept, kind: "audio", expired: false, confirmed: false },
  ] as const;
  const paths: string[] = [];
  const checks: string[] = [];
  let signedIn = false;
  const section = { id: "section-0", text: "합성 회의에서는 검토한 근거를 보존하기로 했습니다.", original_text: "합성 회의에서는 검토한 근거를 보존하기로 했습니다.", origin: "transcribed", edited: false, location: null, start_seconds: 0, end_seconds: 1 };
  try {
    written(await admin.from("orgs").insert({ id: org, name: "원본 보존 격리 QA" }), "org_failed");
    written(await admin.from("departments").insert([dept, manualDept].map((id, index) => ({ id, org_id: org, name: `원본 보존 검증 ${index + 1}` }))), "department_failed");
    const user = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "user").user!;
    written(await admin.from("members").insert([dept, manualDept].map(id => ({ dept_id: id, user_id: user.id, role: "lead", display_name: "합성 검토자", consented_at: new Date().toISOString() }))), "member_failed");
    const session = ok(await actor.auth.signInWithPassword({ email, password }), "login").session!;
    signedIn = true;
    ok(await actor.rpc("set_review_original_retention", { p_dept: dept, p_days: 30 }), "retention");
    ok(await actor.rpc("set_review_original_retention", { p_dept: manualDept, p_days: null }), "manual_retention");
    const snapshots = new Map<string, unknown>();
    const grants = new Map<string, string>();
    const sourceIds: string[] = [], itemIds: string[] = [];
    const snapshot = async (id: string) => {
      const review = ok(await actor.from("reviewed_materials").select("sections,published_source_id,published_revision,revision,status").eq("id", id).single(), "review_snapshot");
      const revisions = ok(await actor.from("review_revisions").select("revision,sections").eq("review_id", id).order("revision"), "revisions_snapshot");
      const source = ok(await actor.from("sources").select("id,active").eq("id", review.published_source_id).single(), "source_snapshot");
      const items = ok(await actor.from("items").select("id,content,deleted_at").eq("source_id", source.id).order("id"), "items_snapshot");
      const summary = ok(await actor.from("document_summaries").select("summary,status").eq("source_id", source.id).single(), "summary_snapshot");
      return { review, revisions, source, items, summary };
    };
    for (const fixture of cases) {
      const bytes = fixture.kind === "audio" ? Buffer.from(encodeMonoWav(new Float32Array(16000).fill(0.125), 16000)) : Buffer.from("합성 문서 원본");
      ok(await actor.rpc("create_review", { p_dept: fixture.dept, p_input: { id: fixture.id, kind: fixture.kind, title: "원본 보존 검증", filename: fixture.kind === "audio" ? "synthetic.wav" : "synthetic.txt", size: bytes.length, fingerprint: "e".repeat(64), duration: fixture.kind === "audio" ? 1 : null, visibility: "dept", participants: [], synthetic: true, consent_confirmed: true } }), "create_review");
      const parts = ok(await actor.from("review_parts").select("object_path").eq("review_id", fixture.id), "parts");
      const fixturePaths = [...new Set([`${fixture.dept}/${fixture.id}/original`, ...parts.map(part => part.object_path)])];
      paths.push(...fixturePaths);
      for (const path of fixturePaths)
        written(await actor.storage.from("review-materials").upload(path, bytes, { contentType: fixture.kind === "audio" ? "audio/wav" : "text/plain" }), "upload_failed");
      written(await admin.from("reviewed_materials").update({ status: "ready", sections: [section], original_uploaded: true }).eq("id", fixture.id), "ready_fixture_failed");
      written(await admin.from("review_parts").update({ status: "done", sections: [section] }).eq("review_id", fixture.id), "parts_fixture_failed");
      written(await admin.from("review_revisions").insert({ review_id: fixture.id, revision: 1, title: "원본 보존 검증", sections: [section], edited_by: user.id }), "revision_fixture_failed");
      if (fixture.kind === "audio") {
        const grant = ok(await actor.rpc("authorize_review_access", { p_dept: fixture.dept, p_review: fixture.id, p_action: "play_original" }), "grant");
        grants.set(fixture.id, grant.token);
      }
      if (fixture.confirmed) {
        const source = ok(await actor.rpc("publish_review", { p_review: fixture.id, p_revision: 1 }), "publish");
        sourceIds.push(source);
        const items = ok(await admin.from("items").select("id").eq("source_id", source), "items");
        itemIds.push(...items.map(item => item.id));
        // Synthetic summary fixture, never an LLM accuracy claim.
        written(await admin.from("document_summaries").update({ status: "summarized", summary: { overview: section.text, citations: [{ item_id: items[0].id, quote: section.text }] } }).eq("source_id", source), "summary_fixture_failed");
        written(await admin.from("reviewed_materials").update({ confirmed_at: new Date(Date.now() - 31 * 86400_000).toISOString() }).eq("id", fixture.id), "age_fixture_failed");
        snapshots.set(fixture.id, await snapshot(fixture.id));
      }
    }
    // Never dispatch the publication jobs: this verification is storage-only.
    for (const [key, ids] of [["documentId", sourceIds], ["itemId", itemIds]] as const)
      written(await admin.from("jobs").update({ status: "failed", last_error: "isolated_storage_verification" }).in(`payload->>${key}`, ids).eq("status", "queued"), "suppress_fixture_jobs_failed");
    const expiredAudio = cases[0];
    const staleTicket = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { ...options, global: { headers: { Authorization: `Bearer ${session.access_token}`, "x-sasu-review-access": grants.get(expiredAudio.id)! } } });
    assert.ok((await staleTicket.storage.from("review-materials").download(`${dept}/${expiredAudio.id}/original`)).error);
    for (const fixture of cases.filter(row => row.expired)) {
      const grant = await actor.rpc("authorize_review_access", { p_dept: dept, p_review: fixture.id, p_action: fixture.kind === "audio" ? "play_original" : "download_original" });
      assert.equal(grant.error?.code, "P0002");
      assert.equal((await actor.rpc("review_action", { p_review: fixture.id, p_revision: 1, p_action: "reextract" })).error?.code, "P0002");
      assert.equal((await actor.rpc("queue_review_part", { p_review: fixture.id, p_index: 0 })).error?.code, "P0002");
    }
    checks.push("expiry_fences_access_tickets_reextract_and_queue_before_sweep");
    assert.equal((await actor.rpc("sweep_review_originals")).error?.code, "42501");
    ok(await admin.rpc("sweep_review_originals"), "sweep");
    ok(await admin.rpc("sweep_review_originals"), "repeat_sweep");
    for (const fixture of cases) {
      const review = ok(await actor.from("reviewed_materials").select("original_deleted_at").eq("id", fixture.id).single(), "deletion_state");
      assert.equal(Boolean(review.original_deleted_at), fixture.expired);
      const jobs = ok(await admin.from("jobs").select("id,payload,status").eq("kind", "purge_review_files").eq("payload->>reviewId", fixture.id), "purge_jobs");
      assert.equal(jobs.length, fixture.expired ? 1 : 0);
      if (fixture.expired) {
        const before = ok(await admin.storage.from("review-materials").download(`${fixture.dept}/${fixture.id}/original`), "before_purge");
        assert.ok(before.size > 0);
      }
      // Exact registered production handler. General job claiming is deliberately
      // not run so unrelated QA jobs cannot call providers or send messages.
      await purgeReviewFiles({ reviewId: fixture.id });
      await purgeReviewFiles({ reviewId: fixture.id });
      for (const path of paths.filter(value => value.startsWith(`${fixture.dept}/${fixture.id}/`))) {
        const download = await admin.storage.from("review-materials").download(path);
        if (fixture.expired) {
          assert.equal(String(download.error?.statusCode), "404");
          assert.equal(download.data, null);
          assert.ok((await actor.storage.from("review-materials").upload(path, Buffer.from("late synthetic upload"))).error);
        } else assert.ok(ok(download, "retained_original").size > 0);
      }
      if (fixture.confirmed) assert.deepEqual(await snapshot(fixture.id), snapshots.get(fixture.id));
    }
    checks.push("one_purge_job_after_repeated_sweep", "real_originals_and_parts_removed", "repeat_purge_is_idempotent", "late_upload_rejected", "manual_and_unconfirmed_originals_retained", "transcripts_revisions_sources_items_summaries_unchanged");
    const calls = await admin.from("llm_calls").select("id", { count: "exact", head: true }).in("dept_id", [dept, manualDept]);
    written(calls, "llm_count_failed");
    assert.equal(calls.count, 0);
    assert.equal(externalRequests, 0);
    const report = { checks, passed: checks.length, failed: 0, storage: "real local Supabase", handler: "purgeReviewFiles", dispatcher: "not-run", llmCalls: calls.count, externalRequests };
    mkdirSync("docs/verification/review-retention-2026-09-24", { recursive: true });
    writeFileSync("docs/verification/review-retention-2026-09-24/storage-results.json", JSON.stringify(report, null, 2) + "\n");
    // Git-ignored local browser fixture. Never write credentials to evidence.
    writeFileSync(".vercel/review-qa/retention-fixture.json", JSON.stringify({ origin, email, password, dept, reviewId: expiredAudio.id }));
    console.log(JSON.stringify(report));
  } finally {
    try {
      // Only this run's synthetic files. Keep audit rows and review evidence.
      if (paths.length) written(await admin.storage.from("review-materials").remove(paths), "fixture_cleanup_failed");
      if (signedIn) await actor.auth.signOut();
    } finally { globalThis.fetch = originalFetch; }
  }
}

main().catch(error => {
  // Assertion details can contain fixture content. Store only a safe failure code.
  const location = error instanceof Error ? error.stack?.match(/verify-review-retention\.ts:\d+:\d+/)?.[0] : undefined;
  const stage = error instanceof Error && /^[a-z_]+(?::[A-Z0-9_]+)?$/.test(error.message) ? error.message : undefined;
  console.error(JSON.stringify({ failed: 1, code: error instanceof assert.AssertionError ? "retention_assertion_failed" : "retention_verification_failed", stage, location }));
  process.exitCode = 1;
});
