import { chunkDocumentText } from "@/lib/adapters/document";
import type { AudioTranscriptionData, AudioTranscriptionSegment, AudioTranscriptionWord } from "@/lib/llm";
import { mask } from "@/lib/mask";
import type { ReviewSection } from "@/lib/contracts";

// Design Ref: 웹 회의 녹음 설계 §11.2 — 창별 단어 소유권은 저장 순서와 무관하게 계산한다.
const WINDOW_SECONDS = 60;

export type TimedReviewSection = ReviewSection & {
  confidence: "normal" | "low" | null;
  boundary_review: boolean;
};

export type TranscriptionWindowProjection = {
  sections: TimedReviewSection[];
  // Relative to this window's start; the next window subtracts 60 seconds.
  lastOwnedWordEnd: number | null;
};

function confidenceOf(segment: AudioTranscriptionSegment | undefined): TimedReviewSection["confidence"] {
  if (!segment || (segment.avg_logprob === null && segment.no_speech_prob === null)) return null;
  return segment.avg_logprob !== null && segment.avg_logprob < -1.0 ||
    segment.no_speech_prob !== null && segment.no_speech_prob > 0.6
    ? "low"
    : "normal";
}

function joinWords(words: AudioTranscriptionWord[]): string {
  return words.reduce((joined, word) => {
    const next = word.word;
    if (!joined) return next;
    if (/^\s/u.test(next) || /[\s(\[{]$/u.test(joined) || /^[,.!?;:%)\]}]/u.test(next)) return joined + next;
    return `${joined} ${next}`;
  }, "").trim();
}

function section(
  text: string,
  windowIndex: number,
  groupIndex: number,
  start: number,
  end: number,
  confidence: TimedReviewSection["confidence"],
  boundaryReview: boolean,
  containsUnmappedSensitiveText = false,
): TimedReviewSection[] {
  const directlyMasked = mask(text);
  const masked = containsUnmappedSensitiveText && directlyMasked === text ? "[민감정보]" : directlyMasked;
  return chunkDocumentText(masked).map((chunk, chunkIndex) => ({
    id: `part-${windowIndex}-${groupIndex}-${chunkIndex}`,
    text: chunk,
    original_text: chunk,
    origin: "transcribed",
    edited: false,
    location: boundaryReview ? "음성 구간 (경계 확인 필요)" : "음성 구간",
    start_seconds: windowIndex * WINDOW_SECONDS + start,
    end_seconds: windowIndex * WINDOW_SECONDS + end,
    confidence,
    boundary_review: boundaryReview,
  }));
}

export function projectTranscriptionWindow(
  data: AudioTranscriptionData,
  windowIndex: number,
  previousLastWordEndInWindow: number | null = null,
): TranscriptionWindowProjection {
  if (!Number.isInteger(windowIndex) || windowIndex < 0 ||
      previousLastWordEndInWindow !== null && (!Number.isFinite(previousLastWordEndInWindow) || previousLastWordEndInWindow < 0)) {
    throw new Error("transcription_window_invalid");
  }
  const cutoff = windowIndex === 0 ? 0 : previousLastWordEndInWindow ?? 0;
  if (data.words.length > 0) {
    const owned = data.words
      .filter((word) => word.start >= cutoff && word.start < WINDOW_SECONDS)
      .sort((left, right) => left.start - right.start);
    const groups: { segment: AudioTranscriptionSegment | undefined; words: AudioTranscriptionWord[] }[] = [];
    for (const word of owned) {
      const segment = data.segments.find((candidate) => word.start >= candidate.start && word.start < candidate.end);
      const last = groups.at(-1);
      if (last && last.segment === segment) last.words.push(word);
      else groups.push({ segment, words: [word] });
    }
    return {
      sections: groups.flatMap((group, index) => {
        const compact = group.words.map((word) => word.word).join("");
        const sensitiveInGroup = mask(compact) !== compact ||
          (group.segment
            ? mask(group.segment.text) !== group.segment.text
            : mask(data.text) !== data.text);
        return section(
          joinWords(group.words), windowIndex, index,
          group.words[0].start, group.words.at(-1)!.end,
          confidenceOf(group.segment), windowIndex > 0 && previousLastWordEndInWindow === null && group.words[0].start < 1,
          sensitiveInGroup,
        );
      }),
      // Provider word ends can overshoot the 61-second window audio; the completion function accepts 0..61.
      lastOwnedWordEnd: owned.length ? Math.min(WINDOW_SECONDS + 1, Math.max(...owned.map((word) => word.end))) : null,
    };
  }

  // A provider may omit word timestamps. Segment ownership is approximate at
  // both overlap edges, so the reviewer must check those boundaries.
  const segments = data.segments.filter((segment) => segment.start < WINDOW_SECONDS);
  if (!segments.length && data.text.trim()) {
    return {
      sections: section(data.text, windowIndex, 0, 0, WINDOW_SECONDS, null, true),
      lastOwnedWordEnd: null,
    };
  }
  return {
    sections: segments.flatMap((segment, index) => section(
      segment.text, windowIndex, index, segment.start, segment.end,
      confidenceOf(segment), windowIndex > 0 && segment.start < 1 || segment.end > WINDOW_SECONDS,
    )),
    lastOwnedWordEnd: null,
  };
}

export function projectTranscriptionWindows(
  windows: Array<{ index: number; data: AudioTranscriptionData }>,
): TimedReviewSection[] {
  const ordered = [...windows].sort((left, right) => left.index - right.index);
  let previousEnd: number | null = null;
  const sections: TimedReviewSection[] = [];
  for (const [position, window] of ordered.entries()) {
    if (window.index !== position) throw new Error("transcription_window_missing");
    const result = projectTranscriptionWindow(window.data, window.index, previousEnd);
    sections.push(...result.sections);
    previousEnd = result.lastOwnedWordEnd === null
      ? null
      : Math.max(0, result.lastOwnedWordEnd - WINDOW_SECONDS);
  }
  return sections;
}
