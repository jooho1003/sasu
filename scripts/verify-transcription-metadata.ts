import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { llm } from "../lib/llm";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("local_supabase_required");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.GROQ_API_KEY)
  throw new Error("local_supabase_or_groq_key_missing");

async function main() {
  const bytes = new Uint8Array(await readFile(resolve("public/demo-files/onsaemiro-sales-weekly-meeting.wav")));
  const result = await llm.transcribeAudio({
    bytes,
    filename: "synthetic-meeting.wav",
    mimeType: "audio/wav",
    includeTimestamps: true,
  });

  // The bundled audio is synthetic; never print even its transcript in a shared log.
  console.log(JSON.stringify({
    textLength: result.data.text.length,
    segments: result.data.segments.length,
    words: result.data.words.length,
    firstSegmentStart: result.data.segments[0]?.start ?? null,
    lastSegmentEnd: result.data.segments.at(-1)?.end ?? null,
  }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "verification_failed");
  process.exitCode = 1;
});
