export type TranscriptSegment = {
  externalRef: string;
  offsetSeconds: number | null;
  speaker: string | null;
  content: string;
};

const TIMESTAMP_PATTERN = /^(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\s+-->\s+\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?/u;
const INLINE_TIMESTAMP_PATTERN = /^\[(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)\]\s*(.+)$/u;
const SPEAKER_PATTERN = /^([^:：]{1,80})\s*[:：]\s*(.+)$/u;

function parseTimestamp(value: string): number | null {
  const pieces = value.split(":").map(Number);
  if (pieces.some((piece) => !Number.isFinite(piece))) return null;
  const seconds = pieces.length === 2
    ? pieces[0] * 60 + pieces[1]
    : pieces[0] * 3_600 + pieces[1] * 60 + pieces[2];
  return Number.isFinite(seconds) ? seconds : null;
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
    throw new Error("unsupported_transcript_format");
  }

  const lines = input.replace(/^\uFEFF/u, "").split(/\r?\n/u);
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

  for (const rawLine of lines) {
    const line = rawLine.trim();
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
  return segments;
}
