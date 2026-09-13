export type TranscriptSegment = {
  externalRef: string;
  offsetSeconds: number | null;
  speaker: string | null;
  content: string;
};

export type TranscriptParseErrorCode =
  | "invalid_vtt_header"
  | "invalid_timestamp"
  | "empty_cue"
  | "no_speech"
  | "unsupported_transcript_format";

export class TranscriptParseError extends Error {
  constructor(
    public readonly code: TranscriptParseErrorCode,
    public readonly line: number | null,
  ) {
    super(code);
    this.name = "TranscriptParseError";
  }
}

const TIMESTAMP_VALUE_PATTERN = /^(?:(\d{1,2}):)?(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/u;
const TIMESTAMP_PATTERN = /^((?:\d{2}:)?\d{2}:\d{2}(?:\.\d{1,3})?)\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}(?:\.\d{1,3})?)$/u;
const INLINE_TIMESTAMP_PATTERN = /^\[(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)\]\s*(.+)$/u;
const SPEAKER_PATTERN = /^([^:：]{1,80})\s*[:：]\s*(.+)$/u;

function parseTimestamp(value: string): number | null {
  const match = TIMESTAMP_VALUE_PATTERN.exec(value);
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes >= 60 || seconds >= 60) return null;
  return hours * 3_600 + minutes * 60 + seconds;
}

function splitSpeaker(text: string): { speaker: string | null; content: string } {
  const match = SPEAKER_PATTERN.exec(text.trim());
  if (!match) return { speaker: null, content: text.trim() };
  const speaker = match[1].trim();
  const content = match[2].trim();
  return speaker && content ? { speaker, content } : { speaker: null, content: text.trim() };
}

function pushSegment(
  segments: TranscriptSegment[],
  value: { externalRef: string; offsetSeconds: number | null; text: string },
): void {
  const content = value.text.trim();
  if (!content || content === "WEBVTT") return;
  const speaker = splitSpeaker(content);
  segments.push({
    externalRef: value.externalRef,
    offsetSeconds: value.offsetSeconds,
    speaker: speaker.speaker,
    content: speaker.content,
  });
}

export function parseTranscript(filename: string, input: string): TranscriptSegment[] {
  const extension = filename.toLowerCase().split(".").pop();
  if (extension !== "vtt" && extension !== "txt") {
    throw new TranscriptParseError("unsupported_transcript_format", null);
  }

  const lines = input.replace(/^\uFEFF/u, "").split(/\r\n|\n|\r/u);
  if (extension === "vtt" && !/^WEBVTT(?:[ \t].*)?$/u.test(lines[0]?.trim() ?? "")) {
    throw new TranscriptParseError("invalid_vtt_header", 1);
  }
  const segments: TranscriptSegment[] = [];
  let cue: { externalRef: string; offsetSeconds: number | null; lines: string[] } | null = null;

  const flush = () => {
    if (!cue) return;
    pushSegment(segments, {
      externalRef: cue.externalRef,
      offsetSeconds: cue.offsetSeconds,
      text: cue.lines.join(" "),
    });
    cue = null;
  };

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    const lineNumber = index + 1;
    if (extension === "vtt" && line.includes("-->")) {
      const [start] = line.split(/\s+-->/u);
      const timestampMatch = TIMESTAMP_PATTERN.exec(line);
      if (!timestampMatch || !start || parseTimestamp(start) === null || parseTimestamp(timestampMatch[2]) === null) {
        throw new TranscriptParseError("invalid_timestamp", lineNumber);
      }
    }
    const cueMatch = TIMESTAMP_PATTERN.exec(line);
    if (cueMatch?.[1]) {
      flush();
      cue = {
        externalRef: cueMatch[1],
        offsetSeconds: parseTimestamp(cueMatch[1]),
        lines: [],
      };
      continue;
    }

    const inlineMatch = INLINE_TIMESTAMP_PATTERN.exec(line);
    if (inlineMatch?.[1] && inlineMatch[2]) {
      flush();
      pushSegment(segments, {
        externalRef: inlineMatch[1],
        offsetSeconds: parseTimestamp(inlineMatch[1]),
        text: inlineMatch[2],
      });
      continue;
    }

    if (!line || line === "WEBVTT" || /^NOTE(?:\s|$)/u.test(line)) {
      flush();
      continue;
    }

    if (cue) {
      cue.lines.push(line);
    } else if (extension === "txt") {
      pushSegment(segments, { externalRef: `line-${segments.length + 1}`, offsetSeconds: null, text: line });
    }
  }
  flush();
  if (segments.length === 0) throw new TranscriptParseError("no_speech", null);
  return segments;
}
