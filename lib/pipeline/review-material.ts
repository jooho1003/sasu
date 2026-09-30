import { randomUUID } from "node:crypto";
import { extractDocumentText } from "@/lib/adapters/document";
import { validateAudioPart } from "@/lib/adapters/review-audio";
import { llm } from "@/lib/llm";
import { registerHandler } from "@/lib/jobs";
import { REVIEW_BUCKET, sectionsFromText } from "@/lib/reviews";
import {
  createRecordingTranscriptionPart,
  verifyRecordingOriginal,
} from "@/lib/recording/original-segments";
import { projectTranscriptionWindow } from "@/lib/recording/transcription-window";
import { glossaryPrompt, type GlossaryEntry } from "@/lib/recording/glossary";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { RecordingManifest, ReviewSection } from "@/lib/contracts";

const SEGMENT_LIST_PAGE_SIZE = 100;

async function downloadReviewBytes(
  client: ReturnType<typeof createServiceSupabaseClient>,
  path: string,
): Promise<Uint8Array> {
  const file = await client.storage.from(REVIEW_BUCKET).download(path);
  if (file.error || !file.data)
    throw Object.assign(new Error("file_unavailable"), {
      error_code: "file_unavailable",
    });
  return new Uint8Array(await file.data.arrayBuffer());
}

export async function processReviewPart(payload: {
  partId: string;
  attempt: number;
}): Promise<void> {
  const client = createServiceSupabaseClient();
  const lease = randomUUID();
  const claim = await client.rpc("claim_review_part", {
    p_part: payload.partId,
    p_attempt: payload.attempt,
    p_lease: lease,
  });
  if (claim.error) throw new Error("review_claim_failed");
  if (!claim.data) return;
  const part = claim.data as {
    kind: "audio" | "document";
    filename: string;
    object_path: string;
    dept_id: string;
    part_index: number;
    start_seconds: number | null;
    end_seconds: number | null;
    original_layout?: "single_file" | "audio_segments";
    manifest?: RecordingManifest;
    segment_paths?: { current: string; next: string | null };
    previous_last_word_end_in_window?: number | null;
  };
  let sections: ReviewSection[] = [];
  let failure: string | null = null;
  let lastWordEnd: number | null = null;
  try {
    let bytes: Uint8Array;
    if (part.original_layout === "audio_segments") {
      const segmentPaths = part.segment_paths;
      if (!segmentPaths)
        throw Object.assign(new Error("audio_segment_invalid"), {
          error_code: "audio_segment_invalid",
        });
      const currentBytes = await downloadReviewBytes(
        client,
        segmentPaths.current,
      );
      const nextBytes =
        segmentPaths.next !== null
          ? await downloadReviewBytes(client, segmentPaths.next)
          : null;
      try {
        const window = await createRecordingTranscriptionPart(
          part.manifest,
          part.part_index,
          currentBytes,
          nextBytes,
        );
        bytes = window.wav;
      } catch {
        throw Object.assign(new Error("audio_segment_invalid"), {
          error_code: "audio_segment_invalid",
        });
      }
    } else {
      bytes = await downloadReviewBytes(client, part.object_path);
    }
    if (bytes.length > (part.kind === "audio" ? 2_100_000 : 20 * 1024 * 1024))
      throw Object.assign(new Error("file_too_large"), {
        error_code: "file_too_large",
      });
    if (
      part.kind === "audio" &&
      !validateAudioPart(
        bytes,
        (part.end_seconds ?? 0) - (part.start_seconds ?? 0),
      )
    )
      throw Object.assign(new Error("audio_segment_invalid"), {
        error_code: "audio_segment_invalid",
      });
    if (part.kind === "audio") {
      const recording = part.original_layout === "audio_segments";
      const terms = await client.from("dept_glossaries")
        .select("term,reading,note,updated_at")
        .eq("dept_id", part.dept_id)
        .order("updated_at", { ascending: false });
      if (terms.error) throw Object.assign(new Error("glossary_lookup_failed"), { error_code: "glossary_lookup_failed" });
      const prompt = glossaryPrompt((terms.data ?? []) as GlossaryEntry[]).text;
      const transcription = await llm.transcribeAudio(
        { bytes, filename: "segment.wav", mimeType: "audio/wav", includeTimestamps: recording, ...(prompt ? { prompt } : {}) },
        { deptId: part.dept_id },
      );
      if (recording) {
        const projected = projectTranscriptionWindow(
          transcription.data,
          part.part_index,
          part.previous_last_word_end_in_window ?? null,
        );
        sections = projected.sections;
        lastWordEnd = projected.lastOwnedWordEnd;
      } else {
        sections = sectionsFromText(transcription.data.text, "audio", `part-${part.part_index}`, part.start_seconds, part.end_seconds);
      }
    } else {
      sections = sectionsFromText(await extractDocumentText(part.filename, bytes), "document", `part-${part.part_index}`, part.start_seconds, part.end_seconds);
    }
    if (
      sections.length > 1000 ||
      sections.reduce((n, s) => n + s.text.length, 0) > 1_000_000
    ) {
      sections = [];
      failure = "extracted_text_too_large";
    }
    if (!sections.length && !failure) failure = "empty_extraction";
  } catch (error) {
    const code =
      error && typeof error === "object"
        ? Reflect.get(error, "error_code")
        : null;
    failure =
      typeof code === "string" &&
      [
        "file_unavailable",
        "file_too_large",
        "audio_segment_invalid",
        "voice_transcription_empty",
        "auth",
        "llm_budget_exceeded",
  "llm_timeout",
        "rate_limited",
        "glossary_lookup_failed",
      ].includes(code)
        ? code
        : "extraction_failed";
  }
  const recording = part.original_layout === "audio_segments";
  const finish = await client.rpc(recording ? "finish_review_recording_part" : "finish_review_part", {
    p_part: payload.partId,
    p_lease: lease,
    p_sections: sections,
    p_error: failure,
    ...(recording ? { p_last_word_end: lastWordEnd } : {}),
  });
  if (finish.error) throw new Error("review_completion_failed");
}

export async function verifyReviewSegment(payload: {
  reviewId: string;
  index: number;
  attempt: number;
  run: number;
}): Promise<void> {
  const client = createServiceSupabaseClient();
  const lease = randomUUID();
  const claim = await client.rpc("claim_review_segment", {
    p_review: payload.reviewId,
    p_index: payload.index,
    p_attempt: payload.attempt,
    p_run: payload.run,
    p_lease: lease,
  });
  if (claim.error) throw new Error("recording_segment_claim_failed");
  if (!claim.data) return;
  const segment = claim.data as {
    object_path: string;
    sample_count: number;
    bytes: number;
    sha256: string;
    index: number;
  };

  let result: "verified" | "missing" | "mismatch" | "retry";
  const file = await client.storage
    .from(REVIEW_BUCKET)
    .download(segment.object_path);
  if (file.error) {
    const status = Reflect.get(file.error, "status");
    const statusCode = Reflect.get(file.error, "statusCode");
    result =
      status === 404 || String(statusCode) === "404" ? "missing" : "retry";
  } else if (!file.data) {
    result = "retry";
  } else if (file.data.size !== segment.bytes) {
    result = "mismatch";
  } else {
    try {
      const bytes = new Uint8Array(await file.data.arrayBuffer());
      await verifyRecordingOriginal(bytes, {
        index: segment.index,
        sample_count: segment.sample_count,
        bytes: segment.bytes,
        sha256: segment.sha256,
      });
      result = "verified";
    } catch {
      result = "mismatch";
    }
  }

  if (result === "mismatch") {
    const removed = await client.storage
      .from(REVIEW_BUCKET)
      .remove([segment.object_path]);
    if (removed.error) result = "retry";
  }

  const finish = await client.rpc("finish_review_segment", {
    p_review: payload.reviewId,
    p_index: payload.index,
    p_lease: lease,
    p_result: result,
  });
  if (finish.error) throw new Error("recording_segment_finish_failed");

  if (result === "retry") {
    throw Object.assign(new Error("recording_segment_unavailable"), {
      error_code: "file_unavailable",
    });
  }
}

async function listSegmentObjects(
  client: ReturnType<typeof createServiceSupabaseClient>,
  prefix: string,
): Promise<string[]> {
  const found: string[] = [];
  let offset = 0;
  for (;;) {
    const page = await client.storage
      .from(REVIEW_BUCKET)
      .list(prefix, { limit: SEGMENT_LIST_PAGE_SIZE, offset });
    if (page.error) throw new Error("review_purge_lookup_failed");
    const entries = (page.data ?? []) as Array<{
      id: string | null;
      name: string;
    }>;
    for (const entry of entries) {
      if (entry.id !== null) found.push(`${prefix}/${entry.name}`);
    }
    if (entries.length < SEGMENT_LIST_PAGE_SIZE) break;
    offset += SEGMENT_LIST_PAGE_SIZE;
  }
  return found;
}

async function removeReviewObjects(
  client: ReturnType<typeof createServiceSupabaseClient>,
  paths: string[],
): Promise<void> {
  for (let i = 0; i < paths.length; i += SEGMENT_LIST_PAGE_SIZE) {
    const chunk = paths.slice(i, i + SEGMENT_LIST_PAGE_SIZE);
    const result = await client.storage.from(REVIEW_BUCKET).remove(chunk);
    if (result.error) throw new Error("review_purge_failed");
  }
}

export async function purgeReviewFiles(payload: {
  reviewId: string;
}): Promise<void> {
  const client = createServiceSupabaseClient();
  const review = await client
    .from("reviewed_materials")
    .select("id,dept_id,original_deleted_at,original_layout")
    .eq("id", payload.reviewId)
    .maybeSingle();
  if (review.error) throw new Error("review_purge_lookup_failed");
  if (!review.data?.original_deleted_at) return;

  if (review.data.original_layout === "audio_segments") {
    const dept = review.data.dept_id;
    const id = review.data.id;
    const segments = await client
      .from("review_original_segments")
      .select("segment_index,attempt")
      .eq("review_id", payload.reviewId);
    if (segments.error) throw new Error("review_purge_lookup_failed");
    const known = (
      (segments.data ?? []) as Array<{
        segment_index: number;
        attempt: number;
      }>
    ).flatMap((row) => {
      const paths: string[] = [];
      for (let attempt = 1; attempt <= row.attempt; attempt++) {
        paths.push(
          `${dept}/${id}/original-segments/${row.segment_index}-${attempt}.wav`,
        );
      }
      return paths;
    });
    const prefix = `${dept}/${id}/original-segments`;
    const listed = await listSegmentObjects(client, prefix);
    await removeReviewObjects(
      client,
      Array.from(new Set([...known, ...listed])),
    );
    const remaining = await listSegmentObjects(client, prefix);
    if (remaining.length > 0) {
      await removeReviewObjects(client, remaining);
    }
    const finalCheck = await listSegmentObjects(client, prefix);
    if (finalCheck.length > 0) {
      throw new Error("review_purge_incomplete");
    }
    return;
  }

  const parts = await client
    .from("review_parts")
    .select("object_path")
    .eq("review_id", payload.reviewId);
  if (parts.error) throw new Error("review_purge_lookup_failed");
  const paths = Array.from(
    new Set([
      `${review.data.dept_id}/${review.data.id}/original`,
      ...(parts.data ?? []).map((p) => p.object_path),
    ]),
  );
  const removed = await client.storage.from(REVIEW_BUCKET).remove(paths);
  if (removed.error) throw new Error("review_purge_failed");
}
export function registerReviewHandlers(): void {
  registerHandler("process_review", processReviewPart);
  registerHandler("verify_review_segment", verifyReviewSegment);
  registerHandler("purge_review_files", purgeReviewFiles);
}
export async function sweepReviewParts(): Promise<void> {
  const client = createServiceSupabaseClient();
  const originals = await client.rpc("sweep_review_originals");
  if (originals.error) throw new Error("review_original_sweep_failed");
  const recordings = await client.rpc("sweep_review_recordings");
  if (recordings.error) throw new Error("recording_session_sweep_failed");
  const result = await client.rpc("sweep_review_parts");
  if (result.error) throw new Error("review_sweep_failed");
}
