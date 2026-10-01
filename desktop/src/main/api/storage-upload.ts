// Design Ref: desktop-companion §4 E12-E13 — upload paths match the reviewed-materials web adapter.
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateAudioPart } from "@sasu/review-audio";
import type { ApiClient } from "./client";
import {
  parseCompanionContext,
  parseReviewCreated,
  parseReviewPartQueued,
} from "../../shared/contracts";
import type { ReviewUploadRequest } from "../../shared/contracts";

export type ReviewUploadInput = ReviewUploadRequest;

export async function uploadReview(
  supabase: SupabaseClient,
  api: ApiClient,
  input: ReviewUploadInput,
): Promise<{ id: string; job_ids: string[] }> {
  if (input.original.byteLength !== input.review.size) {
    throw new Error("review_original_size_invalid");
  }
  if (input.review.kind === "audio") {
    if (
      input.parts.length === 0 ||
      input.parts.some(
        (part, index) =>
          part.index !== index || !validateAudioPart(part.bytes, part.seconds),
      )
    ) {
      throw new Error("review_audio_parts_invalid");
    }
  } else if (input.parts.length !== 0) {
    throw new Error("review_document_parts_invalid");
  }

  const context = await api.get("/api/companion/link", parseCompanionContext);
  const created = await api.postJson(
    "/api/companion/reviews",
    input.review,
    parseReviewCreated,
  );
  if (created.id !== input.review.id) throw new Error("review_id_mismatch");

  const root = `${context.dept.id}/${created.id}`;
  const bucket = supabase.storage.from("review-materials");
  const original = await bucket.upload(`${root}/original`, input.original, {
    contentType: input.contentType || "application/octet-stream",
    upsert: false,
  });
  if (original.error) throw new Error("review_original_upload_failed");

  for (const part of input.parts) {
    const uploaded = await bucket.upload(
      `${root}/parts/${part.index}.wav`,
      part.bytes,
      { contentType: "audio/wav", upsert: false },
    );
    if (uploaded.error) throw new Error("review_part_upload_failed");
  }

  const indices = input.review.kind === "audio" ? input.parts.map(({ index }) => index) : [0];
  const jobs: string[] = [];
  for (const index of indices) {
    const queued = await api.postJson(
      `/api/companion/reviews/${encodeURIComponent(created.id)}/parts`,
      { index },
      parseReviewPartQueued,
    );
    jobs.push(queued.job_id);
  }
  return { id: created.id, job_ids: jobs };
}
