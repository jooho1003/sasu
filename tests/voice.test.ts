import { describe, expect, it } from "vitest";

import { validateVoiceUpload } from "@/lib/adapters/voice";

describe("voice upload validation", () => {
  it("accepts browser recording formats", () => {
    expect(validateVoiceUpload({ filename: "voice.webm", mimeType: "audio/webm", size: 10 }).ok).toBe(true);
    expect(validateVoiceUpload({ filename: "voice.m4a", mimeType: "audio/mp4", size: 10 }).ok).toBe(true);
    expect(validateVoiceUpload({ filename: "voice.wav", mimeType: "audio/wav", size: 10 }).ok).toBe(true);
  });

  it("rejects non-audio files and oversized recordings", () => {
    const unsupported = validateVoiceUpload({ filename: "voice.txt", mimeType: "text/plain", size: 10 });
    const oversized = validateVoiceUpload({ filename: "voice.webm", mimeType: "audio/webm", size: 11 * 1024 * 1024 });
    expect(unsupported.ok).toBe(false);
    expect(oversized.ok).toBe(false);
    if (!unsupported.ok) expect(unsupported.error).toBe("unsupported_audio_format");
    if (!oversized.ok) expect(oversized.error).toBe("audio_too_large");
  });
});
