import { describe, expect, it } from "vitest";

import { parseTranscript } from "@/lib/adapters/transcript";

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
});
