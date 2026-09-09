import { registerHandler } from "@/lib/jobs";
import {
  buildCardBlocks,
  type SlackCardCitation,
  type SlackCardView,
} from "@/lib/slack/blocks";
import { openDirectMessage, postMessage } from "@/lib/slack/post";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type CardStatus = "open" | "decided" | "deferred" | "rejected" | "needs_review";
type DeliveryStatus = "pending" | "sent" | "failed" | "skipped";

type CardRow = {
  id: string;
  dept_id: string;
  title: string;
  background: string;
  recommendation: string | null;
  deadline: string | null;
  assignee_id: string | null;
  visibility: "dept" | "leads_only";
  status: CardStatus;
  slack_delivery_status: DeliveryStatus | null;
};

type MemberRow = {
  slack_user_id: string | null;
  consented_at: string | null;
  role: "lead" | "member";
};

type CitationRow = {
  quote: string;
  item_id: string | null;
  decision_id: string | null;
};

type ItemRow = {
  id: string;
  external_ref: string | null;
  sources:
    | { kind: string; external_id: string; title?: string | null }
    | { kind: string; external_id: string; title?: string | null }[];
};

type ConflictRow = { explanation: string };

type CardViewInput = {
  id: string;
  title: string;
  background: string;
  recommendation: string | null;
  deadline: string | null;
  visibility: "dept" | "leads_only";
  citations: SlackCardCitation[];
  conflicts: { explanation: string }[];
};

class SendSlackDatabaseError extends Error {
  constructor() {
    super("Slack delivery database operation failed");
    this.name = "SendSlackDatabaseError";
  }
}

function ensureNoDatabaseError(error: unknown): void {
  if (error) {
    throw new SendSlackDatabaseError();
  }
}

function relation<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

function appBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/u, "");
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  return "http://localhost:3000";
}

function sourceHref(item: ItemRow, cardUrl: string): string {
  const source = relation(item.sources);
  if (source.kind === "slack_channel" && item.external_ref) {
    return `https://slack.com/archives/${encodeURIComponent(source.external_id)}/p${item.external_ref.replace(/\D/gu, "")}`;
  }
  return cardUrl;
}

export function buildSlackCardView(args: {
  card: CardViewInput;
  webUrl: string;
}): SlackCardView {
  return {
    ...args.card,
    webUrl: args.webUrl,
  };
}

async function updateDelivery(
  client: ReturnType<typeof createServiceSupabaseClient>,
  cardId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const result = await client
    .from("decision_requests")
    .update(values)
    .eq("id", cardId);
  ensureNoDatabaseError(result.error);
}

function itemIds(citations: CitationRow[]): string[] {
  return citations.flatMap((citation) =>
    citation.item_id === null ? [] : [citation.item_id],
  );
}

export async function sendSlackCard(requestId: string): Promise<void> {
  const client = createServiceSupabaseClient();
  const cardResult = await client
    .from("decision_requests")
    .select(
      "id, dept_id, title, background, recommendation, deadline, assignee_id, visibility, status, slack_delivery_status",
    )
    .eq("id", requestId)
    .maybeSingle<CardRow>();
  ensureNoDatabaseError(cardResult.error);

  const card = cardResult.data;
  if (!card || card.slack_delivery_status === "sent") {
    return;
  }
  if (card.status !== "open") {
    if (card.slack_delivery_status === "pending") {
      await updateDelivery(client, card.id, {
        slack_delivery_status: "skipped",
        slack_delivery_error: null,
      });
    }
    return;
  }

  if (!card.assignee_id) {
    await updateDelivery(client, card.id, {
      slack_delivery_status: "failed",
      slack_delivery_error: "slack_dm_unavailable",
    });
    return;
  }

  const memberResult = await client
    .from("members")
    .select("slack_user_id, consented_at, role")
    .eq("user_id", card.assignee_id)
    .eq("dept_id", card.dept_id)
    .maybeSingle<MemberRow>();
  ensureNoDatabaseError(memberResult.error);

  const member = memberResult.data;
  if (!member?.slack_user_id || !member.consented_at) {
    await updateDelivery(client, card.id, {
      slack_delivery_status: "failed",
      slack_delivery_error: "slack_dm_unavailable",
    });
    return;
  }

  if (card.visibility === "leads_only" && member.role !== "lead") {
    await updateDelivery(client, card.id, {
      slack_delivery_status: "failed",
      slack_delivery_error: "slack_dm_unavailable",
    });
    return;
  }

  const [citationsResult, conflictsResult] = await Promise.all([
    client
      .from("citations")
      .select("quote, item_id, decision_id")
      .eq("owner_kind", "decision_request")
      .eq("owner_id", card.id),
    client.from("conflicts").select("explanation").eq("request_id", card.id),
  ]);
  ensureNoDatabaseError(citationsResult.error);
  ensureNoDatabaseError(conflictsResult.error);

  const citations = (citationsResult.data ?? []) as CitationRow[];
  if (citations.length === 0) {
    await updateDelivery(client, card.id, {
      slack_delivery_status: "skipped",
      slack_delivery_error: "citation_invalid",
    });
    return;
  }

  const cardUrl = `${appBaseUrl()}/d/${card.dept_id}/cards/${card.id}`;
  const itemsResult =
    itemIds(citations).length === 0
      ? { data: [] as ItemRow[], error: null }
      : await client
          .from("items")
          .select("id, external_ref, sources!inner(kind, external_id, title)")
          .in("id", itemIds(citations));
  ensureNoDatabaseError(itemsResult.error);

  const itemMap = new Map(
    ((itemsResult.data ?? []) as ItemRow[]).map((item) => [item.id, item]),
  );
  const visibleCitations = citations.flatMap((citation) => {
    if (!citation.item_id) {
      return [{ quote: citation.quote, href: cardUrl }];
    }
    const item = itemMap.get(citation.item_id);
    return item
      ? [{ quote: citation.quote, href: sourceHref(item, cardUrl) }]
      : [];
  });

  if (visibleCitations.length === 0) {
    await updateDelivery(client, card.id, {
      slack_delivery_status: "skipped",
      slack_delivery_error: "citation_invalid",
    });
    return;
  }

  const view = buildSlackCardView({
    card: {
      id: card.id,
      title: card.title,
      background: card.background,
      recommendation: card.recommendation,
      deadline: card.deadline,
      visibility: card.visibility,
      citations: visibleCitations,
      conflicts: (conflictsResult.data ?? []) as ConflictRow[],
    },
    webUrl: cardUrl,
  });
  const dm = await openDirectMessage(member.slack_user_id);
  const message = await postMessage({
    channel: dm.id,
    text: `지금 결정: ${card.title}`,
    blocks: buildCardBlocks(view),
  });

  await updateDelivery(client, card.id, {
    slack_delivery_status: "sent",
    slack_delivery_error: null,
    slack_channel_id: message.channel,
    slack_message_ts: message.ts,
  });
}

export function registerSendSlackHandler(): void {
  registerHandler("send_slack", async (payload: unknown) => {
    if (typeof payload !== "object" || payload === null) {
      throw new Error("send_slack job payload is invalid");
    }
    const requestId = Reflect.get(payload, "requestId");
    if (typeof requestId !== "string" || requestId.length === 0) {
      throw new Error("send_slack job payload is invalid");
    }
    await sendSlackCard(requestId);
  });
}
