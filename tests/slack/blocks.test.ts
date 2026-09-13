import { describe, expect, it } from "vitest";

import {
  buildCardBlocks,
  buildDecisionModal,
  type SlackCardView,
} from "@/lib/slack/blocks";

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
});
