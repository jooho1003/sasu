import { describe, expect, it } from "vitest";
import { answerLead } from "@/lib/answer-grounding";
import {
  buildSlackAnswerMessage,
  type SlackAnswerCitation,
} from "@/lib/slack/answer";

const citation: SlackAnswerCitation = {
  quote: "10% 이상 인상되면 재입찰합니다.",
  author: "민서",
  occurredAt: "2026-09-15T00:15:00.000Z",
  source: "Slack · #영업",
  href: "https://example.slack.com/archives/C123/p1789431300000000",
};

function textObjects(message: ReturnType<typeof buildSlackAnswerMessage>) {
  const result: { type: string; text: string }[] = [];
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (
      "type" in value &&
      "text" in value &&
      typeof value.type === "string" &&
      typeof value.text === "string"
    )
      result.push({ type: value.type, text: value.text });
    Object.values(value).forEach(walk);
  };
  walk(message.blocks);
  return result;
}

describe("Slack 답변과 인용 표시", () => {
  it("2,400자 근거 8개도 고정 안내와 함께 온전히 보낸다", () => {
    const quote = "가".repeat(2400);
    const message = buildSlackAnswerMessage({ answer: answerLead(8), citations: Array.from({ length: 8 }, () => ({ ...citation, quote })) });
    expect(message.text).toContain(answerLead(8));
    expect(message.text.split(quote)).toHaveLength(9);
    expect(message.blocks.length).toBeLessThanOrEqual(50);
    expect(message.text).not.toContain("질문을 나누어");
  });
  it("본문·인용·발언자·KST 시각·링크를 블록과 접근성 text에 모두 넣는다", () => {
    const message = buildSlackAnswerMessage({
      answer: "이번 견적은 재입찰 원칙을 확인해야 합니다.",
      citations: [citation],
    });
    const blocks = JSON.stringify(message.blocks);
    for (const part of [
      "이번 견적",
      citation.quote,
      "민서",
      "2026. 9. 15.",
      "9:15",
      citation.source,
      citation.href,
    ]) {
      expect(blocks).toContain(part);
      expect(message.text).toContain(part);
    }
    expect(message.text).toContain("이 채널에서 볼 수 있는 부서 기록만 보고 답했습니다.");
  });

  it("원문 속 멘션·마크업·링크를 명령이나 링크로 처리하지 않는다", () => {
    const raw = "<!channel> <@U123> <https://evil.example|사내 문서> & *문구*";
    const message = buildSlackAnswerMessage({
      answer: raw,
      citations: [{ ...citation, quote: raw, author: raw, source: raw }],
    });
    expect(message).toMatchObject({
      mrkdwn: false,
      parse: "none",
      unfurl_links: false,
      unfurl_media: false,
    });
    const markdown = textObjects(message).filter(
      (value) => value.type === "mrkdwn",
    );
    expect(JSON.stringify(markdown)).not.toContain("evil.example");
    expect(JSON.stringify(markdown)).not.toContain("<!channel>");
    expect(
      textObjects(message)
        .filter((value) => value.type === "plain_text")
        .some((value) => value.text.includes(raw)),
    ).toBe(true);
  });

  it("시각이나 발언자가 없으면 알 수 없는 값을 만들어내지 않는다", () => {
    const message = buildSlackAnswerMessage({
      answer: "확인된 내용",
      citations: [{ ...citation, author: null, occurredAt: "bad-date" }],
    });
    expect(message.text).toContain("누가 썼는지 모름");
    expect(message.text).toContain("날짜 미상");
    expect(message.text).not.toContain("Invalid Date");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hi",
    "https://name:password@example.com/",
    "//evil.example",
    "",
  ])("안전하지 않은 출처 URL은 표시하지 않는다: %s", (href) => {
    const message = buildSlackAnswerMessage({
      answer: "확인된 내용",
      citations: [{ ...citation, href }],
    });
    expect(
      textObjects(message).filter((value) => value.type === "mrkdwn"),
    ).toEqual([]);
    expect(message.text).toContain(citation.quote);
  });

  it("긴 본문과 인용을 잘라 버리지 않고 여러 블록으로 나눈다", () => {
    const answer = "가나다😀".repeat(900);
    const quote = "장문의 원문😀".repeat(700);
    const message = buildSlackAnswerMessage({
      answer,
      citations: [{ ...citation, quote }],
    });
    expect(message.text).toContain(answer);
    expect(message.text).toContain(quote);
    for (const block of message.blocks) {
      if (block.type === "section")
        expect(
          (block.text as { text: string }).text.length,
        ).toBeLessThanOrEqual(3000);
    }
    const plain = textObjects(message)
      .filter((value) => value.type === "plain_text")
      .map((value) => value.text)
      .join("");
    expect(plain).toContain(answer);
    expect(plain).toContain(quote);
    expect(plain).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u,
    );
  });

  it("출처 URL의 구분자와 쿼리 문자열이 링크 형식을 깨뜨리지 않는다", () => {
    const message = buildSlackAnswerMessage({
      answer: "확인한 답변",
      citations: [
        {
          ...citation,
          href: "https://example.slack.com/a|b?thread_ts=1.2&cid=C123",
        },
      ],
    });
    const markdown = textObjects(message).filter(
      (value) => value.type === "mrkdwn",
    );
    expect(markdown).toHaveLength(1);
    expect(markdown[0].text).toBe(
      "<https://example.slack.com/a%7Cb?thread_ts=1.2&amp;cid=C123|원문 보기>",
    );
  });

  it.each([{ citations: [] }, { citations: [{ ...citation, quote: "" }] }])(
    "근거가 없으면 생성 본문을 내보내지 않는다",
    ({ citations }) => {
      const message = buildSlackAnswerMessage({
        answer: "검증되지 않은 본문",
        citations,
      });
      expect(JSON.stringify(message)).not.toContain("검증되지 않은 본문");
      expect(message.text).toContain("근거");
    },
  );

  it("URL 인코딩 뒤에도 링크 블록 길이 상한을 지킨다", () => {
    const message = buildSlackAnswerMessage({ answer: "확인한 답변", citations: [{ ...citation, href: `https://example.com/${"가".repeat(1000)}` }] });
    expect(textObjects(message).filter((value) => value.type === "mrkdwn")).toEqual([]);
    expect(message.text).toContain(citation.quote);
  });

  it("Slack 상한 초과 시 인용을 누락한 부분 답변 대신 고정 안내를 보낸다", () => {
    const message = buildSlackAnswerMessage({
      answer: "보내면 안 되는 본문",
      citations: Array.from({ length: 30 }, () => ({
        ...citation,
        quote: "가".repeat(3000),
      })),
    });
    expect(message.blocks.length).toBeLessThanOrEqual(50);
    expect(message.text.length).toBeLessThan(4000);
    expect(JSON.stringify(message)).not.toContain("보내면 안 되는 본문");
    expect(message.text).toContain("질문을 나누어");
  });
});
