// Local two-window product integration: session RPC → real Storage → worker →
// Groq → masked review sections. Uses a synthetic WAV and removes its material.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { processReviewPart, purgeReviewFiles, verifyReviewSegment } from "../lib/pipeline/review-material";
import { pcmWav, RECORDING_RATE } from "../lib/recording/pcm";
import { REVIEW_BUCKET } from "../lib/reviews";

loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !process.env.GROQ_API_KEY || !process.env.SEED_LEAD_EMAIL || !process.env.SEED_LEAD_PASSWORD)
  throw new Error("local_product_verification_env_required");

const dept = "22222222-2222-4222-8222-222222222222";
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const recorder = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
const reviewId = randomUUID();
const paths: string[] = [];
let started = false;
let stage = "init";

function data<T>(result: { data: T; error: unknown }, code: string): NonNullable<T> {
  if (result.error || result.data === null) throw new Error(code);
  return result.data as NonNullable<T>;
}

async function main() {
  try {
    stage = "sign_in";
    const login = await recorder.auth.signInWithPassword({
      email: process.env.SEED_LEAD_EMAIL!, password: process.env.SEED_LEAD_PASSWORD!,
    });
    if (login.error || !login.data.session) throw new Error("local_lead_login_failed");
    const member = data(await recorder.from("members").select("user_id").eq("dept_id", dept)
      .eq("role", "member").not("consented_at", "is", null).limit(1).single(), "consented_member_missing");
    const llmBefore = await service.from("llm_calls").select("id", { head: true, count: "exact" })
      .eq("dept_id", dept).eq("purpose", "transcribe_voice");
    if (llmBefore.error) throw new Error("llm_count_failed");
    const llmCountBefore = llmBefore.count ?? 0;

    stage = "start_and_save";
    data(await recorder.rpc("start_review_recording", {
      p_dept: dept,
      p_input: {
        id: reviewId, title: "전사 순서 합성 검증", input_method: "microphone", visibility: "leads_only",
        participants: [member.user_id], consent_confirmed: true, meeting_provider: "in_person",
      },
      p_key_version: 1,
    }), "recording_start_failed");
    started = true;

    const source = await readFile("public/demo-files/onsaemiro-sales-weekly-meeting.wav");
    const samples = new Int16Array((source.length - 44) / 2);
    for (let i = 0; i < samples.length; i++) samples[i] = source.readInt16LE(44 + i * 2);
    const lengths = [60 * RECORDING_RATE, 16 * RECORDING_RATE];
    const originals = lengths.map((length) => {
      const pcm = new Int16Array(length);
      for (let offset = 0; offset < length; offset += samples.length)
        pcm.set(samples.subarray(0, Math.min(samples.length, length - offset)), offset);
      return new Uint8Array(pcmWav(pcm));
    });
    const manifest = {
      version: 1,
      segments: originals.map((bytes, index) => ({
        index, sample_count: lengths[index], bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      })),
    };
    const saved = data(await recorder.rpc("create_review_recording", {
      p_dept: dept, p_recording: reviewId, p_manifest: manifest,
      p_capture: { paused: false, interrupted: false, captured_samples: lengths[0] + lengths[1] },
    }), "recording_save_failed") as { segments: { index: number; path: string }[] };
    assert.equal(saved.segments.length, 2);

    stage = "storage_and_verification";
    for (const segment of saved.segments) {
      const result = await recorder.storage.from(REVIEW_BUCKET).upload(
        segment.path, Buffer.from(originals[segment.index]), { contentType: "audio/wav", upsert: false },
      );
      if (result.error) throw new Error("segment_upload_failed");
      paths.push(segment.path);
    }
    data(await recorder.rpc("finalize_review_recording", { p_dept: dept, p_recording: reviewId }), "recording_finalize_failed");
    const segmentJobs = data(await service.from("jobs").select("payload")
      .eq("kind", "verify_review_segment").eq("payload->>reviewId", reviewId), "segment_jobs_failed") as
      { payload: { reviewId: string; index: number; attempt: number; run: number } }[];
    assert.equal(segmentJobs.length, 2);
    for (const job of segmentJobs) {
      for (let attempt = 0; ; attempt++) {
        try { await verifyReviewSegment(job.payload); break; }
        catch (error) {
          if (!(error instanceof Error) || error.message !== "recording_segment_unavailable" || attempt >= 2) throw error;
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
    }
    const parts = data(await service.from("review_parts").select("id,part_index,attempt,status,last_word_end_seconds")
      .eq("review_id", reviewId).order("part_index"), "review_parts_failed") as
      { id: string; part_index: number; attempt: number; status: string; last_word_end_seconds: number | null }[];
    assert.deepEqual(parts.map((part) => part.part_index), [0, 1]);

    stage = "sequential_transcription";
    const jobsBefore = data(await service.from("jobs").select("id")
      .eq("kind", "process_review").eq("payload->>partId", parts[1].id), "process_jobs_failed").length;
    await processReviewPart({ partId: parts[1].id, attempt: parts[1].attempt });
    const early = data(await service.from("review_parts").select("status")
      .eq("id", parts[1].id).single(), "early_part_read_failed");
    assert.equal(early.status, "queued");
    await processReviewPart({ partId: parts[0].id, attempt: parts[0].attempt });
    const first = data(await service.from("review_parts").select("status,last_word_end_seconds")
      .eq("id", parts[0].id).single(), "first_part_read_failed");
    assert.equal(first.status, "done");
    assert.ok(typeof first.last_word_end_seconds === "number" && first.last_word_end_seconds > 60);
    const jobsAfter = data(await service.from("jobs").select("id")
      .eq("kind", "process_review").eq("payload->>partId", parts[1].id), "next_job_read_failed").length;
    assert.equal(jobsAfter, jobsBefore + 1);
    await processReviewPart({ partId: parts[1].id, attempt: parts[1].attempt });
    const review = data(await service.from("reviewed_materials").select("status,sections")
      .eq("id", reviewId).single(), "review_read_failed");
    assert.equal(review.status, "ready");
    assert.ok(Array.isArray(review.sections) && review.sections.length > 0);
    const second = data(await service.from("review_parts").select("status,last_word_end_seconds")
      .eq("id", parts[1].id).single(), "second_part_read_failed");
    assert.equal(second.status, "done");
    const llmAfter = await service.from("llm_calls").select("id", { head: true, count: "exact" })
      .eq("dept_id", dept).eq("purpose", "transcribe_voice");
    if (llmAfter.error) throw new Error("llm_count_failed");
    const llmCountAfter = llmAfter.count ?? 0;
    assert.equal(llmCountAfter - llmCountBefore, 2);

    console.log(JSON.stringify({
      passed: true, windows: 2, reviewStatus: review.status, sections: review.sections.length,
      firstLastWordEnd: first.last_word_end_seconds, secondLastWordEnd: second.last_word_end_seconds,
      earlyWindowLlmCalls: 0, llmCalls: llmCountAfter - llmCountBefore, successorJobs: jobsAfter - jobsBefore,
    }));
  } finally {
    if (started) {
      const row = await service.from("reviewed_materials").select("revision").eq("id", reviewId).maybeSingle();
      if (row.data) await recorder.rpc("review_action", { p_review: reviewId, p_revision: row.data.revision, p_action: "delete" });
      await purgeReviewFiles({ reviewId });
    }
    if (paths.length) await service.storage.from(REVIEW_BUCKET).remove(paths);
    await recorder.auth.signOut();
  }
}

main().catch((error: unknown) => {
  const code = error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : stage;
  console.error(JSON.stringify({ passed: false, stage: code }));
  process.exitCode = 1;
});
