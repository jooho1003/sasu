import { describe, expect, it } from "vitest";

import { parseTranscript, TranscriptParseError } from "@/lib/adapters/transcript";

describe("transcript parser", () => {
  it("parses WebVTT timestamps and speaker labels", () => {
    const segments = parseTranscript(
      "meeting.vtt",
      `WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n민서: 오늘 배포를 진행해도 될까요?\n\n00:00:04.000 --> 00:00:06.000\n도윤: 롤백 플랜을 먼저 확인하겠습니다.`,
    );

    expect(segments).toEqual([
      {
        externalRef: "00:00:01.000",
        offsetSeconds: 1,
        speaker: "민서",
        content: "오늘 배포를 진행해도 될까요?",
      },
      {
        externalRef: "00:00:04.000",
        offsetSeconds: 4,
        speaker: "도윤",
        content: "롤백 플랜을 먼저 확인하겠습니다.",
      },
    ]);
  });

  it("accepts timestamped text and marks unlabeled speech", () => {
    const segments = parseTranscript(
      "meeting.txt",
      `[00:01:02] 지후: 일정은 금요일까지입니다.\n[00:01:08] 회의실 화면을 공유하겠습니다.`,
    );

    expect(segments[0]?.speaker).toBe("지후");
    expect(segments[0]?.offsetSeconds).toBe(62);
    expect(segments[1]?.speaker).toBe(null);
    expect(segments[1]?.content).toBe("회의실 화면을 공유하겠습니다.");
  });

  it("rejects unsupported extensions", () => {
    expect(() => parseTranscript("meeting.csv", "text")).toThrow("unsupported_transcript_format");
  });

  it("reports a missing WebVTT header on the first line", () => {
    expect(() => parseTranscript("meeting.vtt", "00:00:01.000 --> 00:00:02.000\n민서: 확인합니다.")).toThrow(
      expect.objectContaining({ code: "invalid_vtt_header", line: 1 }),
    );
  });

  it("reports the original line for an invalid VTT timestamp", () => {
    const input = [
      "WEBVTT",
      "",
      "00:00:01.000 --> 00:00:02.000",
      "민서: 첫 발언입니다.",
      "",
      "두 번째 큐",
      "00:00:XX.000 --> 00:00:04.000",
    ].join("\n");

    expect(() => parseTranscript("meeting.vtt", input)).toThrow(
      expect.objectContaining({ code: "invalid_timestamp", line: 7 }),
    );
  });

  it("preserves CRLF source line numbers in timestamp errors", () => {
    const input = "WEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\n민서: 첫 발언입니다.\r\n00:99.000 --> 00:00:04.000";

    expect(() => parseTranscript("meeting.vtt", input)).toThrow(
      expect.objectContaining({ code: "invalid_timestamp", line: 5 }),
    );
  });

  it("reports no speech when valid input has no speech", () => {
    expect(() => parseTranscript("meeting.vtt", "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n")).toThrow(
      expect.objectContaining({ code: "no_speech", line: null }),
    );
    expect(() => parseTranscript("meeting.txt", "\n  \n")).toThrow(
      expect.objectContaining({ code: "no_speech", line: null }),
    );
  });

  it("exposes the structured parse error type", () => {
    try {
      parseTranscript("meeting.vtt", "not a VTT file");
    } catch (error) {
      expect(error).toBeInstanceOf(TranscriptParseError);
    }
  });
});
