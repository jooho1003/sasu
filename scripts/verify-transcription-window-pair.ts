import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";
import { llm } from "../lib/llm";
import { pcmWav, RECORDING_RATE } from "../lib/recording/pcm";
import { createRecordingTranscriptionPart } from "../lib/recording/original-segments";
import { projectTranscriptionWindow } from "../lib/recording/transcription-window";

loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("local_supabase_required");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.GROQ_API_KEY)
  throw new Error("local_supabase_or_groq_key_missing");

async function main() {
  const source = await readFile("public/demo-files/onsaemiro-sales-weekly-meeting.wav");
  const samples = new Int16Array((source.length - 44) / 2);
  for (let index = 0; index < samples.length; index++) samples[index] = source.readInt16LE(44 + index * 2);
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
      index,
      sample_count: lengths[index],
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })),
  };
  let previousEnd: number | null = null;
  const windows = [];
  for (let index = 0; index < originals.length; index++) {
    const window = await createRecordingTranscriptionPart(manifest, index, originals[index], originals[index + 1] ?? null);
    const transcription = await llm.transcribeAudio({
      bytes: window.wav,
      filename: `synthetic-window-${index}.wav`,
      mimeType: "audio/wav",
      includeTimestamps: true,
    });
    const projected = projectTranscriptionWindow(transcription.data, index, previousEnd);
    windows.push({
      index,
      durationMs: transcription.meta.durationMs,
      words: transcription.data.words.length,
      sections: projected.sections.length,
      boundaryReviewSections: projected.sections.filter((section) => section.boundary_review).length,
      lastOwnedWordEnd: projected.lastOwnedWordEnd,
    });
    previousEnd = projected.lastOwnedWordEnd === null ? null : Math.max(0, projected.lastOwnedWordEnd - 60);
  }
  // The source is synthetic. Never print provider text, sections, or keys.
  console.log(JSON.stringify({ windows, totalDurationMs: windows.reduce((total, item) => total + item.durationMs, 0) }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "verification_failed");
  process.exitCode = 1;
});
