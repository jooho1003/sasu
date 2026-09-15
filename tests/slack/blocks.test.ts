import { describe, expect, it } from "vitest";

import {
  buildCardBlocks,
  buildDecisionModal,
  consentBlocks,
  type SlackCardView,
} from "@/lib/slack/blocks";
import { CONSENT_SECTIONS } from "@/lib/consent";

const card: SlackCardView = {
  id: "card-1",
  title: "외주사 B 견적 결정",
  background: "견적 수락 여부를 결정해야 합니다.",
  recommendation: "재입찰 여부를 검토합니다.",
  deadline: null,
  visibility: "dept",
  webUrl: "https://sasu.example/d/dept-1/cards/card-1",
  citations: [
    {
      quote: "외주사 B 견적을 받아도 될까요?",
      href: "https://slack.com/archives/C123/p123",
    },
  ],
  conflicts: [{
    explanation: "과거 원칙과 충돌할 수 있습니다.",
    decided_at: "2026-03-13T15:30:00.000Z",
    href: "https://sasu.example/d/dept-1/ledger#decision-prior",
  }],
};

describe("Slack Block Kit 카드", () => {
  it("결정 재료와 원문 링크, 세 가지 액션을 포함한다", () => {
    const blocks = buildCardBlocks(card);
    const serialized = JSON.stringify(blocks);

    expect(serialized).toContain(card.title);
    expect(serialized).toContain(card.citations[0].quote);
    expect(serialized).toContain(card.citations[0].href);
    expect(serialized).toContain("sasu_decide_card");
    expect(serialized).toContain("sasu_defer_card");
    expect(serialized).toContain("sasu_reject_card");
  });

  it("모달 metadata에 카드와 상태를 넣고 사유 입력을 required로 만든다", () => {
    const modal = buildDecisionModal({
      requestId: card.id,
      status: "decided",
      outcome: card.recommendation ?? card.title,
    });

    expect(modal.callback_id).toBe("sasu_decision_modal");
    expect(modal.private_metadata).toBe(
      JSON.stringify({ requestId: card.id, status: "decided" }),
    );
    expect(JSON.stringify(modal)).toContain("결정 사유");
    expect(JSON.stringify(modal)).toContain("sasu_rationale");
  });

  it("동의 DM은 전문을 먼저 고지하고 마지막 블록에서 본인 동의를 받는다", () => {
    const blocks = consentBlocks({
      deptId: "22222222-2222-4222-8222-222222222222",
      consentUrl: "https://sasu.example/consent?next=%2Fd%2Fdept",
    });
    const serialized = JSON.stringify(blocks);
    const sectionTexts = blocks.flatMap((block) => {
      if (block.type !== "section") {
        return [];
      }
      const text = block.text;
      if (
        typeof text !== "object" ||
        text === null ||
        !("text" in text) ||
        typeof text.text !== "string"
      ) {
        return [];
      }
      return [text.text];
    });
    const fullNotice = sectionTexts.join("\n");

    expect(fullNotice).toContain(CONSENT_SECTIONS.introduction);
    expect(fullNotice).toContain("조직 관리자 권한만으로는 질문·답변·카드·원장의 내용과 질문자별 기록을 볼 수 없습니다.");
    for (const item of CONSENT_SECTIONS.items) {
      expect(fullNotice).toContain(item.title);
      if (item.body) {
        expect(fullNotice).toContain(item.body);
      }
      for (const detail of item.details) {
        expect(fullNotice).toContain(detail);
      }
    }
    expect(sectionTexts.every((text) => text.length <= 3000)).toBe(true);
    expect(blocks.length).toBeLessThanOrEqual(50);
    expect(blocks.at(-1)?.type).toBe("actions");
    expect(serialized).toContain("sasu_consent");
    expect(serialized).toContain("22222222-2222-4222-8222-222222222222");
    expect(serialized).toContain("https://sasu.example/consent");
  });
});
