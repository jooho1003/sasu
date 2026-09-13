export type SlackBlock = Record<string, unknown>;

export type SlackCardCitation = {
  quote: string;
  href: string;
};

export type SlackCardView = {
  id: string;
  title: string;
  background: string;
  recommendation: string | null;
  deadline: string | null;
  visibility: "dept" | "leads_only";
  webUrl: string;
  citations: SlackCardCitation[];
  conflicts: { explanation: string; decided_at: string | null; href: string }[];
};

type DecisionStatus = "decided" | "deferred" | "rejected";

function escapeSlackText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDeadline(value: string | null): string {
  if (!value) {
    return "마감 미정";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "마감 미정";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export function buildCardBlocks(card: SlackCardView): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "지금 결정", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${escapeSlackText(card.title)}*\n마감 · ${escapeSlackText(formatDeadline(card.deadline))}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*배경*\n${escapeSlackText(card.background)}`,
      },
    },
  ];

  if (card.recommendation) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*추천 방향*\n${escapeSlackText(card.recommendation)}`,
      },
    });
  }

  if (card.citations.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          "*근거*",
          ...card.citations.map(
            (citation, index) =>
              `${index + 1}. <${citation.href}|${escapeSlackText(citation.quote)}>`,
          ),
        ].join("\n"),
      },
    });
  }

  if (card.conflicts.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:warning: *과거 결정과 충돌*\n${card.conflicts
          .map(
            (conflict) =>
              `• <${conflict.href}|${escapeSlackText(formatConflictBadge(conflict.decided_at))}> — ${escapeSlackText(conflict.explanation)}`,
          )
          .join("\n")}`,
      },
    });
  }

  blocks.push(
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "sasu_decide_card",
          text: { type: "plain_text", text: "결정", emoji: true },
          style: "primary",
          value: card.id,
        },
        {
          type: "button",
          action_id: "sasu_defer_card",
          text: { type: "plain_text", text: "보류", emoji: true },
          value: card.id,
        },
        {
          type: "button",
          action_id: "sasu_reject_card",
          text: { type: "plain_text", text: "반려", emoji: true },
          style: "danger",
          value: card.id,
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `<${card.webUrl}|웹 카드에서 자세히 보기>`,
        },
      ],
    },
  );

  return blocks;
}

export function buildDecisionModal(args: {
  requestId: string;
  status: DecisionStatus;
  outcome: string;
  deptId?: string;
  channelId?: string;
  messageTs?: string;
}): Record<string, unknown> {
  const statusLabel =
    args.status === "decided"
      ? "결정"
      : args.status === "deferred"
        ? "보류"
        : "반려";

  return {
    type: "modal",
    callback_id: "sasu_decision_modal",
    private_metadata: JSON.stringify({
      requestId: args.requestId,
      status: args.status,
      ...(args.deptId ? { deptId: args.deptId } : {}),
      ...(args.channelId ? { channelId: args.channelId } : {}),
      ...(args.messageTs ? { messageTs: args.messageTs } : {}),
    }),
    title: { type: "plain_text", text: "카드 처리" },
    submit: { type: "plain_text", text: `${statusLabel} 기록` },
    close: { type: "plain_text", text: "취소" },
    blocks: [
      {
        type: "input",
        block_id: "sasu_outcome",
        dispatch_action: false,
        element: {
          type: "plain_text_input",
          action_id: "value",
          initial_value: args.outcome,
          multiline: false,
        },
        label: { type: "plain_text", text: "결과" },
      },
      {
        type: "input",
        block_id: "sasu_rationale",
        element: {
          type: "plain_text_input",
          action_id: "value",
          multiline: true,
          min_length: 1,
          max_length: 1000,
        },
        label: { type: "plain_text", text: "결정 사유" },
      },
    ],
  };
}
import { formatConflictBadge } from "@/lib/conflicts";
