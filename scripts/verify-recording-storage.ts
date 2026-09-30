// Real local Postgres + Storage + production segment-verification/purge handlers.
// No LLM calls, no job dispatcher, no external requests. Invoked by
// `node scripts/review-qa.mjs recording-storage-test`.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { verifyReviewSegment, purgeReviewFiles } from "@/lib/pipeline/review-material";
import { streamRecordingOriginals, createRecordingTranscriptionPart } from "@/lib/recording/original-segments";
import { validateAudioPart } from "@/lib/adapters/review-audio";
import { RECORDING_RATE } from "@/lib/recording/pcm";
import { REVIEW_BUCKET } from "@/lib/reviews";
import type { Checkpoint } from "@/lib/recording/session";

let currentStage = "init";
function step(name: string) {
  currentStage = name;
}

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
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  function ok<R extends { data: unknown; error: unknown }>(result: R, stage: string): NonNullable<R["data"]> {
    if (result.error || result.data === null) throw new Error(`${stage}_failed`);
    return result.data as NonNullable<R["data"]>;
  }
  function written(result: { error: unknown }, stage: string) {
    if (result.error) throw new Error(stage);
  }
  function hasStatus(error: unknown, code: number): boolean {
    const e = error as { status?: number; statusCode?: unknown } | null;
    return e != null && (e.status === code || String(e.statusCode) === String(code));
  }
  function isTransientStorageError(error: unknown): boolean {
    return hasStatus(error, 502) || hasStatus(error, 503) || hasStatus(error, 504);
  }
  // The local Dockerized Storage API occasionally answers with a 502/503/504 under
  // the sustained sequential load this script generates. Retrying only these
  // status codes cannot mask a real RLS/permission denial (4xx) or a real 404.
  async function storageCall<T extends { error: unknown }>(fn: () => Promise<T>, tries = 4): Promise<T> {
    let result = await fn();
    for (let attempt = 1; attempt < tries && isTransientStorageError(result.error); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      result = await fn();
    }
    return result;
  }
  function corrupt(wav: Uint8Array): Uint8Array {
    const copy = new Uint8Array(wav);
    for (let i = 44; i < copy.length; i++) copy[i] ^= 0xff;
    return copy;
  }
  // verifyReviewSegment's own "retry" outcome (a non-404 Storage download error,
  // e.g. a transient 502/503/504 from the local Docker Storage API) is its
  // documented retryable contract: it clears the lease without changing status,
  // attempt or verify_run, so re-invoking it with the SAME payload is exactly
  // what the real job dispatcher would do on the next sweep. This is never run
  // here (per instructions), so this loop stands in for that one retry step.
  async function verifySegmentWithRetry(
    payload: { reviewId: string; index: number; attempt: number; run: number },
    tries = 4,
  ): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await verifyReviewSegment(payload);
        return;
      } catch (error) {
        const retryable = error instanceof Error && error.message === "recording_segment_unavailable";
        if (!retryable || attempt >= tries) throw error;
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }
  }
  async function buildOriginals(fullSeconds: number, tailSamples: number, valueAt: (i: number) => number) {
    async function* checkpoints(): AsyncGenerator<Checkpoint> {
      for (let i = 0; i < fullSeconds; i++)
        yield { sequence: i, pcm: new Int16Array(RECORDING_RATE).fill(valueAt(i)) };
      if (tailSamples > 0) yield { sequence: fullSeconds, pcm: new Int16Array(tailSamples).fill(valueAt(fullSeconds)) };
    }
    const originals: { descriptor: { index: number; sample_count: number; bytes: number; sha256: string }; wav: Uint8Array }[] = [];
    for await (const original of streamRecordingOriginals(checkpoints())) originals.push(original);
    return originals;
  }

  const org = randomUUID(), dept = randomUUID();
  const password = () => randomBytes(32).toString("base64url");
  const recorderEmail = `recorder-${randomUUID()}@example.test`;
  const lead2Email = `lead2-${randomUUID()}@example.test`;
  const memberEmail = `member-${randomUUID()}@example.test`;
  const checks: string[] = [];
  const denials: Record<string, boolean> = {};
  let recorderSignedIn = false, lead2SignedIn = false;
  const recorder = createClient(url, anonKey, options);
  const lead2 = createClient(url, anonKey, options);
  const uploadedPaths = new Set<string>();

  try {
    step("fixtures");
    written(await admin.from("orgs").insert({ id: org, name: "구간 저장 격리 QA" }), "org_failed");
    written(await admin.from("departments").insert({ id: dept, org_id: org, name: "구간 저장 검증" }), "department_failed");
    const recorderUser = ok(await admin.auth.admin.createUser({ email: recorderEmail, password: password(), email_confirm: true }), "recorder_user").user!;
    const lead2User = ok(await admin.auth.admin.createUser({ email: lead2Email, password: password(), email_confirm: true }), "lead2_user").user!;
    const memberUser = ok(await admin.auth.admin.createUser({ email: memberEmail, password: password(), email_confirm: true }), "member_user").user!;
    // Passwords above are discarded; re-derive per-user passwords we actually sign in with.
    const recorderPassword = password(), lead2Password = password();
    written(await admin.auth.admin.updateUserById(recorderUser.id, { password: recorderPassword }), "recorder_password_failed");
    written(await admin.auth.admin.updateUserById(lead2User.id, { password: lead2Password }), "lead2_password_failed");
    written(await admin.from("members").insert([
      { dept_id: dept, user_id: recorderUser.id, role: "lead", display_name: "합성 녹음자", consented_at: new Date().toISOString() },
      { dept_id: dept, user_id: lead2User.id, role: "lead", display_name: "합성 부서장2", consented_at: new Date().toISOString() },
      { dept_id: dept, user_id: memberUser.id, role: "member", display_name: "합성 팀원", consented_at: new Date().toISOString() },
    ]), "members_failed");
    // org_settings has no direct service_role write grant; it is only writable
    // through this SECURITY DEFINER RPC, gated on org_admins membership.
    written(await admin.from("org_admins").insert({ org_id: org, user_id: recorderUser.id, granted_by: "recording-storage-qa" }), "org_admin_grant_failed");
    const recorderLogin = ok(await recorder.auth.signInWithPassword({ email: recorderEmail, password: recorderPassword }), "recorder_login");
    recorderSignedIn = true;
    ok(await lead2.auth.signInWithPassword({ email: lead2Email, password: lead2Password }), "lead2_login");
    lead2SignedIn = true;
    const recorderToken = recorderLogin.session!.access_token;
    written(await recorder.rpc("admin_set_review_settings", { p_recording: true, p_download: false }), "org_settings_failed");
    checks.push("fixtures_created");

    // ---- Step 1: start + save (create_review_recording) ----
    step("step1_start_and_save");
    const recordingId = randomUUID();
    const started = ok(await recorder.rpc("start_review_recording", {
      p_dept: dept,
      p_input: {
        id: recordingId, title: "구간 검증 합성 회의", input_method: "microphone", visibility: "leads_only",
        participants: [memberUser.id], consent_confirmed: true, meeting_provider: "in_person",
      },
      p_key_version: 1,
    }), "start_review_recording");
    assert.equal((started as { state: string }).state, "active");

    const originals = await buildOriginals(61, 8000, (i) => ((i % 200) - 100) || 1);
    assert.equal(originals.length, 2);
    assert.equal(originals[0].descriptor.sample_count, 960000);
    assert.equal(originals[1].descriptor.sample_count, 24000);
    const manifest = { version: 1 as const, segments: originals.map((o) => o.descriptor) };
    const totalSamples = originals.reduce((n, o) => n + o.descriptor.sample_count, 0);

    const saved = ok(await recorder.rpc("create_review_recording", {
      p_dept: dept, p_recording: recordingId, p_manifest: manifest,
      p_capture: { paused: false, interrupted: false, captured_samples: totalSamples },
    }), "create_review_recording") as { review_id: string; state: string; segments: { index: number; attempt: number; path: string; status: string }[] };
    assert.equal(saved.state, "saving");
    assert.equal(saved.segments.length, 2);
    for (const s of saved.segments) assert.equal(s.path, `${dept}/${recordingId}/original-segments/${s.index}-1.wav`);
    const reviewRow = ok(await admin.from("reviewed_materials").select("original_layout,original_path,status").eq("id", recordingId).single(), "review_row") as { original_layout: string; original_path: string | null; status: string };
    assert.equal(reviewRow.original_layout, "audio_segments");
    assert.equal(reviewRow.original_path, null);
    assert.equal(reviewRow.status, "uploading");
    checks.push("save_creates_two_segments_in_uploading_review");

    // ---- Step 2: real Storage upload rules ----
    step("step2_upload_rules");
    const path0 = `${dept}/${recordingId}/original-segments/0-1.wav`;
    const path1 = `${dept}/${recordingId}/original-segments/1-1.wav`;
    const upload = (client: typeof recorder, path: string, bytes: Uint8Array, upsert = false) =>
      storageCall(() => client.storage.from(REVIEW_BUCKET).upload(path, Buffer.from(bytes), { contentType: "audio/wav", upsert }));

    written(await upload(recorder, path0, originals[0].wav), "segment0_upload_failed");
    uploadedPaths.add(path0);
    checks.push("recorder_uploads_correct_segment0");

    const wrongSegment1 = corrupt(originals[1].wav);
    written(await upload(recorder, path1, wrongSegment1), "segment1_wrong_upload_failed");
    uploadedPaths.add(path1);
    checks.push("recorder_uploads_wrong_same_length_segment1");

    denials.lead2CrossUpload = Boolean((await upload(lead2, path1, originals[1].wav)).error);
    assert.ok(denials.lead2CrossUpload);
    denials.partsPathUpload = Boolean((await upload(recorder, `${dept}/${recordingId}/parts/0.wav`, originals[0].wav)).error);
    assert.ok(denials.partsPathUpload);
    denials.windowsPathUpload = Boolean((await upload(recorder, `${dept}/${recordingId}/windows/0`, originals[0].wav)).error);
    assert.ok(denials.windowsPathUpload);
    denials.wrongAttemptPathUpload = Boolean((await upload(recorder, `${dept}/${recordingId}/original-segments/1-2.wav`, originals[1].wav)).error);
    assert.ok(denials.wrongAttemptPathUpload);
    const dup1 = await upload(recorder, path0, originals[0].wav, false);
    denials.duplicateNoUpsert409 = Boolean(dup1.error) && hasStatus(dup1.error, 409);
    assert.ok(denials.duplicateNoUpsert409);
    const dup2 = await upload(recorder, path0, originals[0].wav, true);
    denials.duplicateWithUpsert = Boolean(dup2.error);
    assert.ok(denials.duplicateWithUpsert);
    checks.push("storage_denials_confirmed_for_cross_user_wrong_prefix_and_duplicate_paths");

    // ---- Step 3: finalize -> verify (real handler) ----
    step("step3_finalize_and_verify");
    const processedJobIds = new Set<string>();
    async function newSegmentJobs(expected: number) {
      const rows = ok(await admin.from("jobs").select("id,payload").eq("kind", "verify_review_segment").eq("payload->>reviewId", recordingId), "segment_jobs") as { id: string; payload: { reviewId: string; index: number; attempt: number; run: number } }[];
      const fresh = rows.filter((r) => !processedJobIds.has(r.id));
      assert.equal(fresh.length, expected);
      for (const r of fresh) processedJobIds.add(r.id);
      return fresh;
    }

    const finalized1 = ok(await recorder.rpc("finalize_review_recording", { p_dept: dept, p_recording: recordingId }), "finalize1") as { segments: { index: number; status: string }[] };
    assert.ok(finalized1.segments.every((s) => s.status === "verifying"));
    const firstJobs = await newSegmentJobs(2);
    for (const job of firstJobs) await verifySegmentWithRetry(job.payload);
    checks.push("finalize_marks_both_segments_verifying_and_verify_handler_runs");

    const segmentsAfter1 = ok(await admin.from("review_original_segments").select("segment_index,attempt,status,error_code,object_path").eq("review_id", recordingId).order("segment_index"), "segments_after_1") as { segment_index: number; attempt: number; status: string; error_code: string | null; object_path: string }[];
    const seg0After1 = segmentsAfter1.find((s) => s.segment_index === 0)!;
    const seg1After1 = segmentsAfter1.find((s) => s.segment_index === 1)!;
    assert.equal(seg0After1.status, "verified");
    assert.equal(seg1After1.attempt, 2);
    assert.equal(seg1After1.status, "awaiting_upload");
    assert.equal(seg1After1.error_code, "segment_mismatch");
    const path1Attempt2 = `${dept}/${recordingId}/original-segments/1-2.wav`;
    assert.equal(seg1After1.object_path, path1Attempt2);
    const oldSegment1Download = await storageCall(() => admin.storage.from(REVIEW_BUCKET).download(path1));
    assert.ok(oldSegment1Download.error && hasStatus(oldSegment1Download.error, 404));
    uploadedPaths.delete(path1);
    checks.push("segment0_verified_segment1_mismatch_bumped_attempt_and_old_object_deleted");

    // ---- Step 4: correct re-upload + second finalize/verify ----
    step("step4_reupload_and_complete");
    written(await upload(recorder, path1Attempt2, originals[1].wav), "segment1_correct_reupload_failed");
    uploadedPaths.add(path1Attempt2);
    denials.oldAttemptPathAfterMismatch = Boolean((await upload(recorder, path1, originals[1].wav)).error);
    assert.ok(denials.oldAttemptPathAfterMismatch);

    const finalized2 = ok(await recorder.rpc("finalize_review_recording", { p_dept: dept, p_recording: recordingId }), "finalize2");
    void finalized2;
    const secondJobs = await newSegmentJobs(1);
    for (const job of secondJobs) await verifySegmentWithRetry(job.payload);
    checks.push("second_upload_and_verify_completes_recording");

    const recordingRowAfter = ok(await admin.from("reviewed_materials").select("status,original_uploaded").eq("id", recordingId).single(), "recording_row_after") as { status: string; original_uploaded: boolean };
    assert.equal(recordingRowAfter.status, "processing");
    assert.equal(recordingRowAfter.original_uploaded, true);
    // review_recordings revokes service_role entirely; only the owner's session
    // (RLS review_recordings_owner_read) or list_review_recordings can read it.
    const sessionRowAfter = ok(await recorder.from("review_recordings").select("state").eq("id", recordingId).single(), "session_row_after") as { state: string };
    assert.equal(sessionRowAfter.state, "completed");
    const parts = ok(await admin.from("review_parts").select("id,part_index,object_path,status,attempt").eq("review_id", recordingId).order("part_index"), "review_parts") as { id: string; part_index: number; object_path: string; status: string; attempt: number }[];
    assert.equal(parts.length, 2);
    for (const p of parts) {
      assert.equal(p.object_path, `${dept}/${recordingId}/windows/${p.part_index}`);
      assert.equal(p.status, "queued");
    }
    const partIds = parts.map((p) => p.id);
    const processJobs = ok(await admin.from("jobs").select("id").eq("kind", "process_review").in("payload->>partId", partIds), "process_review_jobs");
    assert.equal((processJobs as { id: string }[]).length, 2);
    written(await admin.from("jobs").update({ status: "failed", last_error: "isolated_storage_verification" }).in("payload->>partId", partIds).eq("status", "queued"), "suppress_process_review_jobs_failed");
    checks.push("completion_creates_two_review_parts_and_process_review_jobs_suppressed");

    // ---- Step 5: key context after completion ----
    step("step5_key_after_completion");
    const keyAfterCompletion = await recorder.rpc("recording_key_context", { p_dept: dept, p_review: recordingId });
    assert.equal(keyAfterCompletion.error?.code, "P0002");
    checks.push("recording_key_context_rejected_after_completion");

    // ---- Step 6: window assembly with real objects, no LLM ----
    step("step6_window_assembly");
    const part0 = parts.find((p) => p.part_index === 0)!;
    const lease = randomUUID();
    const claim = ok(await admin.rpc("claim_review_part", { p_part: part0.id, p_attempt: part0.attempt, p_lease: lease }), "claim_review_part") as {
      original_layout: string; manifest: { version: number; segments: { index: number; sample_count: number; bytes: number; sha256: string }[] };
      segment_paths: { current: string; next: string | null };
    };
    assert.equal(claim.original_layout, "audio_segments");
    assert.equal(claim.segment_paths.current, path0);
    assert.equal(claim.segment_paths.next, path1Attempt2);
    const seg0Blob = ok(await storageCall(() => admin.storage.from(REVIEW_BUCKET).download(claim.segment_paths.current)), "seg0_download");
    const seg1Blob = ok(await storageCall(() => admin.storage.from(REVIEW_BUCKET).download(claim.segment_paths.next!)), "seg1_download");
    const seg0Bytes = new Uint8Array(await (seg0Blob as Blob).arrayBuffer());
    const seg1Bytes = new Uint8Array(await (seg1Blob as Blob).arrayBuffer());
    const window0 = await createRecordingTranscriptionPart(claim.manifest, 0, seg0Bytes, seg1Bytes);
    assert.equal(validateAudioPart(window0.wav, 61), true);
    assert.equal(window0.wav.byteLength, 44 + 976000 * 2);
    written(await admin.rpc("finish_review_part", { p_part: part0.id, p_lease: lease, p_sections: [], p_error: "isolated_storage_verification" }), "finish_review_part_failed");
    const lastWindow = await createRecordingTranscriptionPart(claim.manifest, 1, seg1Bytes, null);
    assert.equal(validateAudioPart(lastWindow.wav, 1.5), true);
    assert.equal(lastWindow.wav.byteLength, 44 + 24000 * 2);
    checks.push("window_assembly_matches_manifest_boundaries_without_llm");

    // ---- Step 7: segment access through real Storage RLS ----
    step("step7_segment_access_rls");
    const wholeFileAccess = await recorder.rpc("authorize_review_access", { p_dept: dept, p_review: recordingId, p_action: "play_original" });
    assert.equal(wholeFileAccess.error?.code, "22023");
    checks.push("whole_file_access_rejected_for_segmented_original");

    const grant0 = ok(await recorder.rpc("authorize_review_segment_access", { p_dept: dept, p_review: recordingId, p_index: 0, p_action: "play_original" }), "grant0") as { token: string; path: string };
    const ticketClient = (token: string) => createClient(url, anonKey, { ...options, global: { headers: { Authorization: `Bearer ${recorderToken}`, "x-sasu-review-access": token } } });
    const firstDownload = ok(await storageCall(() => ticketClient(grant0.token).storage.from(REVIEW_BUCKET).download(grant0.path)), "segment_grant_download");
    const firstDownloadBytes = Buffer.from(await (firstDownload as Blob).arrayBuffer());
    assert.ok(firstDownloadBytes.equals(Buffer.from(originals[0].wav)));
    checks.push("segment_grant_download_matches_uploaded_bytes_exactly");

    denials.secondDownloadSameToken = Boolean((await storageCall(() => ticketClient(grant0.token).storage.from(REVIEW_BUCKET).download(grant0.path))).error);
    assert.ok(denials.secondDownloadSameToken);

    const grant0b = ok(await recorder.rpc("authorize_review_segment_access", { p_dept: dept, p_review: recordingId, p_index: 0, p_action: "play_original" }), "grant0b") as { token: string };
    denials.crossSegmentGrant = Boolean((await storageCall(() => ticketClient(grant0b.token).storage.from(REVIEW_BUCKET).download(path1Attempt2))).error);
    assert.ok(denials.crossSegmentGrant);

    const grant0c = ok(await recorder.rpc("authorize_review_segment_access", { p_dept: dept, p_review: recordingId, p_index: 0, p_action: "play_original" }), "grant0c") as { token: string; path: string };
    const signResult = await storageCall(() => ticketClient(grant0c.token).storage.from(REVIEW_BUCKET).createSignedUrl(grant0c.path, 86400));
    denials.signedUrlRejected = Boolean(signResult.error) || !signResult.data?.signedUrl;
    assert.ok(denials.signedUrlRejected);

    const downloadOriginalGrant = await recorder.rpc("authorize_review_segment_access", { p_dept: dept, p_review: recordingId, p_index: 0, p_action: "download_original" });
    denials.downloadOriginalSwitchOff = downloadOriginalGrant.error?.code === "42501";
    assert.ok(denials.downloadOriginalSwitchOff);
    checks.push("single_use_cross_segment_and_download_switch_denials_confirmed");

    // ---- Step 8: purge ----
    step("step8_purge");
    const revisionRow = ok(await admin.from("reviewed_materials").select("revision").eq("id", recordingId).single(), "revision_row") as { revision: number };
    written(await recorder.rpc("review_action", { p_review: recordingId, p_revision: revisionRow.revision, p_action: "delete_original" }), "delete_original_failed");
    const lateObjectPath = `${dept}/${recordingId}/original-segments/7-1.wav`;
    written(await upload(admin, lateObjectPath, originals[0].wav.slice(0, 44 + 16000 * 2)), "late_object_upload_failed");
    const purgeJobs = ok(await admin.from("jobs").select("id").eq("kind", "purge_review_files").eq("payload->>reviewId", recordingId), "purge_jobs");
    assert.ok((purgeJobs as { id: string }[]).length >= 1);

    await purgeReviewFiles({ reviewId: recordingId });
    await purgeReviewFiles({ reviewId: recordingId });
    checks.push("delete_original_enqueues_purge_and_real_handler_runs_twice");

    for (const path of [path0, path1, path1Attempt2, lateObjectPath]) {
      const download = await storageCall(() => admin.storage.from(REVIEW_BUCKET).download(path));
      assert.ok(download.error && hasStatus(download.error, 404));
    }
    uploadedPaths.clear();
    const segmentsListing = ok(await storageCall(() => admin.storage.from(REVIEW_BUCKET).list(`${dept}/${recordingId}/original-segments`)), "segments_listing_after_purge");
    assert.equal((segmentsListing as unknown[]).length, 0);
    const reviewFolderListing = ok(await storageCall(() => admin.storage.from(REVIEW_BUCKET).list(`${dept}/${recordingId}`)), "review_folder_listing_after_purge");
    assert.ok(!(reviewFolderListing as { name: string }[]).some((entry) => entry.name === "parts"));
    denials.uploadAfterPurge = Boolean((await upload(recorder, path0, originals[0].wav)).error);
    assert.ok(denials.uploadAfterPurge);
    checks.push("purge_removes_all_attempts_and_late_objects_idempotently_and_blocks_further_upload");

    // ---- Step 9: discard path ----
    step("step9_discard");
    const secondId = randomUUID();
    ok(await recorder.rpc("start_review_recording", {
      p_dept: dept,
      p_input: {
        id: secondId, title: "구간 폐기 합성 회의", input_method: "microphone", visibility: "leads_only",
        participants: [memberUser.id], consent_confirmed: true, meeting_provider: "in_person",
      },
      p_key_version: 1,
    }), "start_second_recording");
    const secondOriginals = await buildOriginals(10, 0, (i) => (i % 50) + 1);
    assert.equal(secondOriginals.length, 1);
    const secondManifest = { version: 1 as const, segments: secondOriginals.map((o) => o.descriptor) };
    const secondSaved = ok(await recorder.rpc("create_review_recording", {
      p_dept: dept, p_recording: secondId, p_manifest: secondManifest,
      p_capture: { paused: false, interrupted: false, captured_samples: secondOriginals[0].descriptor.sample_count },
    }), "create_second_recording") as { segments: { index: number; path: string }[] };
    const secondPath = secondSaved.segments[0].path;
    written(await upload(recorder, secondPath, secondOriginals[0].wav), "second_segment_upload_failed");
    uploadedPaths.add(secondPath);

    const discarded = ok(await recorder.rpc("discard_review_recording", { p_dept: dept, p_recording: secondId }), "discard_review_recording") as { state: string };
    assert.equal(discarded.state, "discarded");
    const secondReviewRow = ok(await admin.from("reviewed_materials").select("status,original_deleted_at").eq("id", secondId).single(), "second_review_row") as { status: string; original_deleted_at: string | null };
    assert.equal(secondReviewRow.status, "cancelled");
    assert.ok(secondReviewRow.original_deleted_at);
    await purgeReviewFiles({ reviewId: secondId });
    uploadedPaths.delete(secondPath);
    const secondDownload = await storageCall(() => admin.storage.from(REVIEW_BUCKET).download(secondPath));
    assert.ok(secondDownload.error && hasStatus(secondDownload.error, 404));
    checks.push("discard_marks_cancelled_and_purge_removes_the_single_segment");

    // ---- Step 10: no LLM calls, no external requests ----
    step("step10_llm_and_external_zero");
    const llmCallsResult = await admin.from("llm_calls").select("id", { count: "exact", head: true }).eq("dept_id", dept);
    written(llmCallsResult, "llm_calls_count_failed");
    assert.equal(llmCallsResult.count, 0);
    assert.equal(externalRequests, 0);
    checks.push("zero_llm_calls_and_zero_external_requests");

    const report = {
      checks, passed: checks.length, failed: 0, storage: "real local Supabase",
      handlers: ["verifyReviewSegment", "purgeReviewFiles"], dispatcher: "not-run",
      llmCalls: llmCallsResult.count, externalRequests, denials,
    };
    mkdirSync("docs/verification/recording-segments-2026-09-25", { recursive: true });
    writeFileSync("docs/verification/recording-segments-2026-09-25/storage-results.json", JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report));
  } finally {
    try {
      if (uploadedPaths.size) written(await storageCall(() => admin.storage.from(REVIEW_BUCKET).remove([...uploadedPaths])), "cleanup_failed");
      if (recorderSignedIn) await recorder.auth.signOut();
      if (lead2SignedIn) await lead2.auth.signOut();
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
}

main().catch((error) => {
  // Assertion diffs and RPC payloads can contain fixture identifiers. Store only a safe failure code.
  const location = error instanceof Error ? error.stack?.match(/verify-recording-storage\.ts:\d+:\d+/)?.[0] : undefined;
  const safeMessage = error instanceof Error && /^[a-z_]+(?::[A-Z0-9_]+)?$/.test(error.message) ? error.message : undefined;
  console.error(JSON.stringify({
    failed: 1,
    code: error instanceof assert.AssertionError ? "recording_storage_assertion_failed" : "recording_storage_verification_failed",
    stage: safeMessage ?? currentStage,
    location,
  }));
  process.exitCode = 1;
});
