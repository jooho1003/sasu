import { randomUUID } from "node:crypto";
import { extractDocumentText } from "@/lib/adapters/document";
import { validateAudioPart } from "@/lib/adapters/review-audio";
import { llm } from "@/lib/llm";
import { registerHandler } from "@/lib/jobs";
import { REVIEW_BUCKET, sectionsFromText } from "@/lib/reviews";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { ReviewSection } from "@/lib/contracts";

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
  };
  let sections: ReviewSection[] = [];
  let failure: string | null = null;
  try {
    const file = await client.storage
      .from(REVIEW_BUCKET)
      .download(part.object_path);
    if (file.error || !file.data)
      throw Object.assign(new Error("file_unavailable"), {
        error_code: "file_unavailable",
      });
    const bytes = new Uint8Array(await file.data.arrayBuffer());
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
    const text =
      part.kind === "audio"
        ? (
            await llm.transcribeAudio(
              { bytes, filename: "segment.wav", mimeType: "audio/wav" },
              { deptId: part.dept_id },
            )
          ).data.text
        : await extractDocumentText(part.filename, bytes);
    sections = sectionsFromText(
      text,
      part.kind,
      `part-${part.part_index}`,
      part.start_seconds,
      part.end_seconds,
    );
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
        "llm_timeout",
        "rate_limited",
      ].includes(code)
        ? code
        : "extraction_failed";
  }
  const finish = await client.rpc("finish_review_part", {
    p_part: payload.partId,
    p_lease: lease,
    p_sections: sections,
    p_error: failure,
  });
  if (finish.error) throw new Error("review_completion_failed");
}

export async function purgeReviewFiles(payload: {
  reviewId: string;
}): Promise<void> {
  const client = createServiceSupabaseClient();
  const review = await client
    .from("reviewed_materials")
    .select("id,dept_id,original_deleted_at")
    .eq("id", payload.reviewId)
    .maybeSingle();
  if (review.error) throw new Error("review_purge_lookup_failed");
  if (!review.data?.original_deleted_at) return;
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
  registerHandler("purge_review_files", purgeReviewFiles);
}
export async function sweepReviewParts(): Promise<void> {
  const result = await createServiceSupabaseClient().rpc("sweep_review_parts");
  if (result.error) throw new Error("review_sweep_failed");
}
