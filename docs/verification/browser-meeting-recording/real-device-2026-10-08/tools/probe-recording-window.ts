// Local diagnostic only (not committed): rebuild one recording transcription window exactly like processReviewPart
// and evaluate finish_review_recording_part's guards (boundary range, mask_review_text idempotence) without finishing.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
const local = JSON.parse(readFileSync("../sasu/.vercel/real-device-20261005/env.json" /* run from a worktree root after copying to scripts/ */, "utf8"));
process.env.NEXT_PUBLIC_SUPABASE_URL = local.url; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = local.anon; process.env.SUPABASE_SERVICE_ROLE_KEY = local.service;
loadEnvConfig(process.cwd());
const [reviewId, indexArg, outFile] = process.argv.slice(2);
const index = Number(indexArg);
const sqlMask = (text: string) => execFileSync("docker", ["exec", "-i", "supabase_db_review-qa", "psql", "-U", "postgres", "-d", "postgres", "-At"], { encoding: "utf8", input: "select public.mask_review_text($sasu$" + text + "$sasu$);" }).replace(/\n$/, "");
async function main() {
  const { createServiceSupabaseClient } = await import("../lib/supabase/service");
  const { createRecordingTranscriptionPart } = await import("../lib/recording/original-segments");
  const { projectTranscriptionWindow } = await import("../lib/recording/transcription-window");
  const { llm } = await import("../lib/llm");
  const db = createServiceSupabaseClient();
  const segs = (await db.from("review_original_segments").select("segment_index,sample_count,bytes,sha256,object_path").eq("review_id", reviewId).order("segment_index")).data!;
  const prior = index > 0 ? (await db.from("review_parts").select("last_word_end_seconds").eq("review_id", reviewId).eq("part_index", index - 1).single()).data : null;
  const manifest = { version: 1, segments: segs.map((s) => ({ index: s.segment_index, sample_count: s.sample_count, bytes: s.bytes, sha256: s.sha256 })) };
  const dl = async (p: string) => new Uint8Array(await (await db.storage.from("review-materials").download(p)).data!.arrayBuffer());
  const cur = await dl(segs[index].object_path);
  const next = segs[index + 1] ? await dl(segs[index + 1].object_path) : null;
  const window = await createRecordingTranscriptionPart(manifest, index, cur, next);
  const previous = prior?.last_word_end_seconds == null ? null : Math.max(0, prior.last_word_end_seconds - 60);
  const transcription = await llm.transcribeAudio({ bytes: window.wav, filename: "segment.wav", mimeType: "audio/wav", includeTimestamps: true, ...(process.env.PROBE_PROMPT ? { prompt: process.env.PROBE_PROMPT } : {}) }, { deptId: "22222222-2222-4222-8222-222222222222" });
  const projected = projectTranscriptionWindow(transcription.data, index, previous);
  const checks = projected.sections.map((s: { text: string; original_text: string }, i: number) => {
    const mt = sqlMask(s.text); const mo = sqlMask(s.original_text);
    return { i, textOk: mt === s.text, originalOk: mo === s.original_text, ...(mt !== s.text ? { text: s.text, sqlMasked: mt } : {}), ...(mo !== s.original_text ? { original: s.original_text, sqlMaskedOriginal: mo } : {}) };
  });
  const result = { reviewId, index, previous, lastOwnedWordEnd: projected.lastOwnedWordEnd, boundaryOk: projected.lastOwnedWordEnd == null || (projected.lastOwnedWordEnd >= 0 && projected.lastOwnedWordEnd <= 61), sections: projected.sections.length, failing: checks.filter((c) => !c.textOk || !c.originalOk) };
  writeFileSync(outFile, JSON.stringify({ ...result, projected, raw: transcription.data }, null, 1));
  console.log(JSON.stringify(result).slice(0, 2500));
}
main().catch((e) => { console.log(JSON.stringify({ error: (e as Error).message, code: (e as { error_code?: string }).error_code })); });
