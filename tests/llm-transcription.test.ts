import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), insert: vi.fn(), toFile: vi.fn() }));
vi.mock("groq-sdk", () => ({
  default: class { audio = { transcriptions: { create: mocks.create } }; },
  APIError: class extends Error {},
  APIConnectionError: class extends Error {},
  APIConnectionTimeoutError: class extends Error {},
}));
vi.mock("groq-sdk/uploads", () => ({ toFile: mocks.toFile }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}));

import { llm } from "@/lib/llm";

const audio = { bytes: new Uint8Array([1, 2, 3]), filename: "sample.wav", mimeType: "audio/wav" };

describe("Groq 음성 전사 계약", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GROQ_API_KEY", "synthetic-test-key");
    mocks.toFile.mockResolvedValue(new Blob([audio.bytes]));
    mocks.insert.mockResolvedValue({ error: null });
  });

  it("짧은 ASK 음성은 기존 json 텍스트 요청을 유지한다", async () => {
    mocks.create.mockResolvedValue({ text: " 짧은 질문 " });
    const result = await llm.transcribeAudio(audio);
    expect(result.data.text).toBe("짧은 질문");
    expect(result.data.segments).toEqual([]);
    expect(result.data.words).toEqual([]);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ response_format: "json" }));
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty("timestamp_granularities");
    expect(mocks.insert).toHaveBeenCalledOnce();
  });

  it("자료 전사는 segment·word 시각과 신뢰도 원자료를 반환한다", async () => {
    mocks.create.mockResolvedValue({
      text: "온새미로 기준을 확인합니다.",
      segments: [{ start: 0.2, end: 2.4, text: "온새미로 기준을 확인합니다.", avg_logprob: -0.2, no_speech_prob: 0.01 }],
      words: [{ start: 0.2, end: 0.8, word: "온새미로" }, { start: 0.9, end: 2.4, word: "기준을 확인합니다." }],
    });
    const result = await llm.transcribeAudio({ ...audio, includeTimestamps: true, prompt: "온새미로" });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
      prompt: "온새미로",
    }));
    expect(result.data.segments).toEqual([{ start: 0.2, end: 2.4, text: "온새미로 기준을 확인합니다.", avg_logprob: -0.2, no_speech_prob: 0.01 }]);
    expect(result.data.words).toEqual([{ start: 0.2, end: 0.8, word: "온새미로" }, { start: 0.9, end: 2.4, word: "기준을 확인합니다." }]);
    expect(mocks.insert).toHaveBeenCalledOnce();
  });

  it("마스킹되지 않은 프롬프트는 공급자 호출 전에 막는다", async () => {
    await expect(llm.transcribeAudio({ ...audio, includeTimestamps: true, prompt: "qa@example.com" }))
      .rejects.toMatchObject({ error_code: "unmasked_prompt" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("잘못된 시각 메타데이터는 원문 없이 스키마 오류로 거절한다", async () => {
    mocks.create.mockResolvedValue({ text: "내용", segments: [{ text: "secret", start: 3, end: 1 }], words: [] });
    await expect(llm.transcribeAudio({ ...audio, includeTimestamps: true }))
      .rejects.toMatchObject({ error_code: "schema_invalid" });
    expect(mocks.insert).toHaveBeenCalledOnce();
  });
});
