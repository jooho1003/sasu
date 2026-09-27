import type { SlackBlock } from "@/lib/slack/blocks";

export type SlackAnswerCitation = {
  quote: string;
  author: string | null;
  occurredAt: string | null;
  source: string;
  href: string | null;
  linkLabel?: "원문 보기" | "부서에서 보기" | "결정 기록 보기";
};

const FOOTER = "이 채널에서 볼 수 있는 부서 기록만 보고 답했습니다.";
const MESSAGE_OPTIONS = {
  mrkdwn: false,
  parse: "none",
  unfurl_links: false,
  unfurl_media: false,
} as const;
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function plain(text: string) {
  return { type: "plain_text", text, emoji: false };
}

// Slack limits each section to 3,000 characters. Count UTF-16 conservatively,
// and keep surrogate pairs together so a boundary never damages the source.
function sections(text: string): SlackBlock[] {
  const blocks: SlackBlock[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + 3_000, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1;
    blocks.push({ type: "section", text: plain(text.slice(start, end)) });
    start = end;
  }
  return blocks;
}

function sourceUrl(href: string | null): string | null {
  if (!href || href.length > 1_500) return null;
  try {
    const url = new URL(href);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    const encoded = url.href.replace(/[<>|]/g, (char) => encodeURIComponent(char));
    return encoded.replace(/&/g, "&amp;").length <= 1_800 ? encoded : null;
  } catch {
    return null;
  }
}

function notice(text: string) {
  return { text, blocks: sections(text), ...MESSAGE_OPTIONS };
}

/** Only pass citations whose quotes have already passed source validation. */
export function buildSlackAnswerMessage(input: {
  answer: string;
  citations: SlackAnswerCitation[];
  scope?: "user" | "channel";
}) {
  const footer = input.scope === "user" ? "내가 볼 수 있는 부서 기록만 보고 답했습니다." : FOOTER;
  if (
    !input.citations.length ||
    input.citations.some((citation) => !citation.quote.trim())
  ) {
    return notice("이 질문에 답할 근거를 부서 기록에서 확인하지 못했습니다.");
  }
  const tooLong = () =>
    notice(
      "답변과 근거가 슬랙 메시지 한도를 넘었습니다. 질문을 나누어 다시 물어봐 주세요.",
    );
  // Bound allocation before splitting arbitrarily long model output.
  if (
    input.citations.length > 20 ||
    input.answer.length +
      input.citations.reduce(
        (length, citation) => length + citation.quote.length,
        0,
      ) >
      38_000
  )
    return tooLong();

  const blocks: SlackBlock[] = [
    { type: "header", text: plain("사수의 답변") },
    ...sections(input.answer),
    { type: "divider" },
  ];
  const fallback = ["사수의 답변", input.answer];

  input.citations.forEach((citation, index) => {
    const date = citation.occurredAt ? new Date(citation.occurredAt) : null;
    const time =
      date && Number.isFinite(date.getTime())
        ? `${dateFormatter.format(date)} (KST)`
        : "날짜 미상";
    const author = Array.from(citation.author?.trim() || "누가 썼는지 모름")
      .slice(0, 200)
      .join("");
    const source = Array.from(citation.source || "부서 기록")
      .slice(0, 300)
      .join("");
    const metadata = `근거 ${index + 1} · ${author} · ${time}\n${source}`;
    const href = sourceUrl(citation.href);
    const label = citation.linkLabel ?? "원문 보기";
    blocks.push(
      { type: "context", elements: [plain(metadata)] },
      ...sections(citation.quote),
    );
    if (href)
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `<${href.replace(/&/g, "&amp;")}|${label}>`,
            verbatim: true,
          },
        ],
      });
    fallback.push(
      metadata,
      citation.quote,
      ...(href ? [`${label}: ${href}`] : []),
    );
  });

  blocks.push({ type: "context", elements: [plain(footer)] });
  fallback.push(footer);
  const text = fallback.join("\n\n");
  if (blocks.length > 50 || text.length > 39_000) return tooLong();
  return { text, blocks, ...MESSAGE_OPTIONS };
}
