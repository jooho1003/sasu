const AUDIO_EXTENSIONS = new Set(["webm", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "flac"]);

export const MAX_VOICE_UPLOAD_BYTES = 10 * 1024 * 1024;

export function validateVoiceUpload(args: {
  filename: string;
  mimeType: string;
  size: number;
}): { ok: true } | { ok: false; error: "unsupported_audio_format" | "audio_too_large" | "audio_empty" } {
  const extension = args.filename.toLowerCase().split(".").pop() ?? "";
  const mimeLooksAudio = args.mimeType === "" || args.mimeType.toLowerCase().startsWith("audio/") || args.mimeType.toLowerCase() === "video/webm";
  if (!AUDIO_EXTENSIONS.has(extension) || !mimeLooksAudio) {
    return { ok: false, error: "unsupported_audio_format" };
  }
  if (args.size <= 0) {
    return { ok: false, error: "audio_empty" };
  }
  if (args.size > MAX_VOICE_UPLOAD_BYTES) {
    return { ok: false, error: "audio_too_large" };
  }
  return { ok: true };
}
