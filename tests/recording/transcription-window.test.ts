import { describe, expect, it } from "vitest";
import { projectTranscriptionWindow, projectTranscriptionWindows } from "@/lib/recording/transcription-window";
import type { AudioTranscriptionData } from "@/lib/llm";

const transcript = (overrides: Partial<AudioTranscriptionData> = {}): AudioTranscriptionData => ({
  text: "첫 단어 마지막 단어",
  segments: [{ text: "첫 단어 마지막 단어", start: 58.4, end: 60.8, avg_logprob: -0.2, no_speech_prob: 0.1 }],
  words: [
    { word: "첫", start: 58.4, end: 58.8 },
    { word: "단어", start: 59.1, end: 59.5 },
    { word: "마지막", start: 60.1, end: 60.4 },
    { word: "단어", start: 60.5, end: 60.8 },
  ],
  ...overrides,
});

describe("전사 창의 단어 소유와 원본 시각", () => {
  it("현재 창은 60초 전에 시작한 단어만 소유하고 다음 창에 마지막 단어 끝을 넘긴다", () => {
    const result = projectTranscriptionWindow(transcript(), 0);
    expect(result.sections.map((section) => section.text)).toEqual(["첫 단어"]);
    expect(result.sections[0]).toMatchObject({ start_seconds: 58.4, end_seconds: 59.5, confidence: "normal", boundary_review: false });
    expect(result.lastOwnedWordEnd).toBe(59.5);
  });

  it("단어 끝 시각이 61초 창 길이를 넘으면 다음 창 경계 값은 창 길이로 보정한다", () => {
    // 2026-10-08 실기기 V20: Whisper가 61초 창의 마지막 단어 끝을 61.04초로 돌려줘 완료 함수(≤61)가 거절했다.
    const result = projectTranscriptionWindow(transcript({
      words: [
        { word: "앞", start: 58.9, end: 59.4 },
        { word: "걸친", start: 59.6, end: 61.04 },
      ],
      segments: [{ text: "앞 걸친", start: 58.9, end: 61.04, avg_logprob: -0.2, no_speech_prob: 0.1 }],
    }), 6, 0.68);
    expect(result.sections.map((section) => section.text)).toEqual(["앞 걸친"]);
    expect(result.lastOwnedWordEnd).toBe(61);
  });

  it("다음 창은 앞 창의 마지막 단어가 끝나기 전에 시작한 단어를 버린다", () => {
    const result = projectTranscriptionWindow(transcript({
      words: [
        { word: "겹친", start: 0.1, end: 0.4 },
        { word: "새", start: 0.5, end: 0.7 },
        { word: "내용", start: 0.8, end: 1.1 },
      ],
      segments: [{ text: "겹친 새 내용", start: 0.1, end: 1.1, avg_logprob: -1.2, no_speech_prob: 0.1 }],
    }), 1, 0.5);
    expect(result.sections.map((section) => section.text)).toEqual(["새 내용"]);
    expect(result.sections[0]).toMatchObject({ start_seconds: 60.5, end_seconds: 61.1, confidence: "low" });
  });

  it("무음 확률이 높은 구간과 시각 없는 단어도 원문 마스킹·검토 신호를 보존한다", () => {
    const result = projectTranscriptionWindow(transcript({
      words: [{ word: "qa@example.com", start: 1, end: 2 }],
      segments: [{ text: "qa@example.com", start: 1, end: 2, avg_logprob: null, no_speech_prob: 0.8 }],
    }), 0);
    expect(result.sections[0]).toMatchObject({ text: "[이메일]", original_text: "[이메일]", confidence: "low" });
    expect(JSON.stringify(result)).not.toContain("qa@example.com");
  });

  it("공급자가 이메일을 여러 단어로 쪼개도 원문 조각을 저장하지 않는다", () => {
    const result = projectTranscriptionWindow(transcript({
      text: "연락 qa@example.com",
      words: [{ word: "qa@", start: 1, end: 1.2 }, { word: "example.com", start: 1.3, end: 2 }],
      segments: [{ text: "연락", start: 1, end: 2, avg_logprob: null, no_speech_prob: null }],
    }), 0);
    expect(result.sections[0].text).toBe("[민감정보]");
    expect(JSON.stringify(result)).not.toContain("example.com");
  });

  it("민감정보가 있는 창에서도 다른 segment의 일반 문장은 유지한다", () => {
    const result = projectTranscriptionWindow(transcript({
      text: "연락 qa@example.com. 다음 회의를 준비합니다.",
      words: [
        { word: "qa@", start: 1, end: 1.2 },
        { word: "example.com", start: 1.3, end: 2 },
        { word: "다음", start: 3, end: 3.3 },
        { word: "회의를", start: 3.4, end: 3.7 },
        { word: "준비합니다.", start: 3.8, end: 4.2 },
      ],
      segments: [
        { text: "연락", start: 1, end: 2, avg_logprob: null, no_speech_prob: null },
        { text: "다음 회의를 준비합니다.", start: 3, end: 4.2, avg_logprob: null, no_speech_prob: null },
      ],
    }), 0);
    expect(result.sections.map((section) => section.text)).toEqual(["[민감정보]", "다음 회의를 준비합니다."]);
  });

  it("word 배열이 없으면 segment 기준으로 남기고 경계를 확인 대상으로 표시한다", () => {
    const result = projectTranscriptionWindow(transcript({ words: [], segments: [
      { text: "겹칠 수 있음", start: 0.2, end: 0.9, avg_logprob: null, no_speech_prob: null },
      { text: "다음 창 몫", start: 60.2, end: 60.8, avg_logprob: null, no_speech_prob: null },
    ] }), 1);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toMatchObject({ text: "겹칠 수 있음", boundary_review: true, start_seconds: 60.2, end_seconds: 60.9 });
    expect(result.lastOwnedWordEnd).toBeNull();
  });

  it("segment가 없어도 단어를 버리지 않고 신뢰도 미상으로 둔다", () => {
    const result = projectTranscriptionWindow(transcript({ segments: [], words: [{ word: "근거", start: 2, end: 2.5 }] }), 2);
    expect(result.sections[0]).toMatchObject({ text: "근거", confidence: null, start_seconds: 122, end_seconds: 122.5 });
  });

  it("시각 배열이 모두 비어 있으면 전사 본문을 남기고 정확한 위치 미상으로 표시한다", () => {
    const result = projectTranscriptionWindow(transcript({ text: "검토할 문장", segments: [], words: [] }), 1);
    expect(result.sections[0]).toMatchObject({ text: "검토할 문장", confidence: null, boundary_review: true, start_seconds: 60, end_seconds: 120 });
  });

  it("창의 완료 순서와 상관없이 인덱스 순서로 조립해 겹친 단어를 한 번만 남긴다", () => {
    const first = transcript({
      words: [{ word: "경계", start: 59.8, end: 60.3 }],
      segments: [{ text: "경계", start: 59.8, end: 60.3, avg_logprob: -0.1, no_speech_prob: 0 }],
    });
    const second = transcript({
      words: [{ word: "경계", start: 0, end: 0.3 }, { word: "후속", start: 0.4, end: 0.8 }],
      segments: [{ text: "경계 후속", start: 0, end: 0.8, avg_logprob: -0.1, no_speech_prob: 0 }],
    });
    const result = projectTranscriptionWindows([{ index: 1, data: second }, { index: 0, data: first }]);
    expect(result.map((section) => section.text)).toEqual(["경계", "후속"]);
    expect(result.map((section) => section.start_seconds)).toEqual([59.8, 60.4]);
  });

  it("이전 창에 단어 시각이 없으면 다음 창의 경계 단어도 확인 대상으로 둔다", () => {
    const first = transcript({ words: [], segments: [{ text: "앞말", start: 59.7, end: 60.4, avg_logprob: null, no_speech_prob: null }] });
    const second = transcript({ words: [{ word: "뒷말", start: 0.2, end: 0.6 }], segments: [] });
    const result = projectTranscriptionWindows([{ index: 0, data: first }, { index: 1, data: second }]);
    expect(result).toHaveLength(2);
    expect(result[0].boundary_review).toBe(true);
    expect(result[1].boundary_review).toBe(true);
  });
});
