import type { SlackBlock } from "@/lib/slack/blocks";
import { currentSlackToken } from "@/lib/slack/workspace";

type SlackApiErrorCode =
  | "slack_not_configured"
  | "slack_rate_limited"
  | "slack_api_failed"
  | "slack_message_missing"
  | "slack_dm_unavailable";

export class SlackApiError extends Error {
  readonly error_code: SlackApiErrorCode;
  readonly retryAfterSeconds: number | null;

  constructor(
    errorCode: SlackApiErrorCode,
    retryAfterSeconds: number | null = null,
  ) {
    super(errorCode);
    this.name = "SlackApiError";
    this.error_code = errorCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type SlackResponse = {
  ok?: boolean;
  error?: string;
  response_metadata?: { next_cursor?: string };
  channel?: string | { id?: string };
  ts?: string;
  channels?: Array<{
    id?: string;
    name?: string;
    is_private?: boolean;
  }>;
  members?:
    | string[]
    | Array<{
        id?: string;
        name?: string;
        real_name?: string;
        deleted?: boolean;
        is_bot?: boolean;
        profile?: { display_name?: string; real_name?: string };
      }>;
  user_id?: string;
};

const SLACK_API_URL = "https://slack.com/api";
const MAX_RATE_LIMIT_RETRIES = 3;

function token(): string {
  // Every request/job must bind a workspace. An unbound call cannot use a global bot token.
  const value = currentSlackToken();
  if (!value) {
    throw new SlackApiError("slack_not_configured");
  }
  return value;
}

function retryAfter(response: Response): number {
  const value = Number(response.headers.get("retry-after"));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function apiError(response: SlackResponse, status: number): SlackApiError {
  if (response.error === "message_not_found") return new SlackApiError("slack_message_missing");
  if (status === 429 || response.error === "ratelimited") {
    return new SlackApiError("slack_rate_limited");
  }
  if (
    response.error === "channel_not_found" ||
    response.error === "user_not_found"
  ) {
    return new SlackApiError("slack_dm_unavailable");
  }
  return new SlackApiError("slack_api_failed");
}

async function callSlack(
  method: string,
  body: Record<string, unknown>,
): Promise<SlackResponse> {
  const authToken = token();

  for (let attempt = 0; attempt < MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const response = await fetch(`${SLACK_API_URL}/${method}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${authToken}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });

    let parsed: SlackResponse;
    try {
      parsed = (await response.json()) as SlackResponse;
    } catch {
      throw new SlackApiError("slack_api_failed");
    }

    if (response.status !== 429 && parsed.ok === true) {
      return parsed;
    }

    const error = apiError(parsed, response.status);
    const delay = retryAfter(response);
    if (
      error.error_code !== "slack_rate_limited" ||
      attempt === MAX_RATE_LIMIT_RETRIES - 1 || delay > 2
    ) {
      throw error.error_code === "slack_rate_limited" ? new SlackApiError("slack_rate_limited", delay) : error;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, delay * 1_000);
    });
  }

  throw new SlackApiError("slack_api_failed");
}

export async function openDirectMessage(
  userId: string,
): Promise<{ id: string }> {
  const response = await callSlack("conversations.open", { users: userId });
  const channel = response.channel;
  const channelId = typeof channel === "string" ? channel : channel?.id;
  if (!channelId) {
    throw new SlackApiError("slack_dm_unavailable");
  }
  return { id: channelId };
}

export async function postMessage(args: {
  channel: string;
  text: string;
  blocks: SlackBlock[];
  thread_ts?: string;
  mrkdwn?: boolean;
  parse?: "none";
  unfurl_links?: boolean;
  unfurl_media?: boolean;
  client_msg_id?: string;
}): Promise<{ channel: string; ts: string }> {
  const response = await callSlack("chat.postMessage", args);
  if (
    !response.channel ||
    typeof response.channel !== "string" ||
    !response.ts
  ) {
    throw new SlackApiError("slack_api_failed");
  }
  return { channel: response.channel, ts: response.ts };
}

/** Optional citation enrichment: fail quickly instead of delaying the answer. */
export async function getMessagePermalink(args: {
  channel: string;
  messageTs: string;
}): Promise<string> {
  const params = new URLSearchParams({
    channel: args.channel,
    message_ts: args.messageTs,
  });
  const response = await fetch(`${SLACK_API_URL}/chat.getPermalink?${params}`, {
    headers: { authorization: `Bearer ${token()}` },
    signal: AbortSignal.timeout(5_000),
  });
  let parsed: SlackResponse & { permalink?: unknown };
  try {
    parsed = await response.json();
  } catch {
    throw new SlackApiError("slack_api_failed");
  }
  if (!response.ok || parsed.ok !== true)
    throw apiError(parsed, response.status);
  if (typeof parsed.permalink !== "string" || !parsed.permalink)
    throw new SlackApiError("slack_api_failed");
  return parsed.permalink;
}

export async function openModal(args: {
  triggerId: string;
  view: Record<string, unknown>;
}): Promise<void> {
  await callSlack("views.open", {
    trigger_id: args.triggerId,
    view: args.view,
  });
}

export async function updateMessage(args: {
  channel: string;
  ts: string;
  text: string;
  blocks: SlackBlock[];
  mrkdwn?: boolean;
  parse?: "none";
  unfurl_links?: boolean;
  unfurl_media?: boolean;
}): Promise<void> {
  await callSlack("chat.update", args);
}

export async function postEphemeral(args: { channel: string; user: string; text: string; thread_ts?: string }): Promise<void> {
  await callSlack("chat.postEphemeral", { ...args, mrkdwn: false, parse: "none" });
}

export async function listConversations(): Promise<
  Array<{ id: string; name: string; isPrivate: boolean }>
> {
  const response = await callSlack("conversations.list", {
    limit: 200,
    types: "public_channel,private_channel",
    exclude_archived: true,
  });
  return (response.channels ?? []).flatMap((channel) =>
    channel.id && channel.name
      ? [
          {
            id: channel.id,
            name: channel.name,
            isPrivate: channel.is_private === true,
          },
        ]
      : [],
  );
}

export async function conversationMembers(channel: string): Promise<string[]> {
  const response = await callSlack("conversations.members", {
    channel,
    limit: 1_000,
  });
  return (response.members ?? []).filter(
    (member): member is string => typeof member === "string",
  );
}

export type SlackDirectoryUser = {
  id: string;
  displayName: string;
};

export async function listUsers(): Promise<SlackDirectoryUser[]> {
  const response = await callSlack("users.list", { limit: "200" });
  const members = Array.isArray(response.members) ? response.members : [];
  return members.flatMap((member) => {
    if (
      typeof member === "string" ||
      !member.id ||
      member.deleted ||
      member.is_bot
    )
      return [];
    const displayName =
      member.profile?.display_name ||
      member.profile?.real_name ||
      member.real_name ||
      member.name ||
      member.id;
    return [{ id: member.id, displayName }];
  });
}

export async function authenticatedBotUserId(): Promise<string | null> {
  const response = await callSlack("auth.test", {});
  return response.user_id ?? null;
}

export async function postChannelMessage(args: {
  channel: string;
  text: string;
}): Promise<{ channel: string; ts: string }> {
  return postMessage({ channel: args.channel, text: args.text, blocks: [] });
}

export type SlackHistoryPage = {
  messages: Array<{
    type?: string;
    channel?: string;
    user?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
    bot_id?: string;
    subtype?: string;
    username?: string;
    files?: unknown[];
  }>;
  nextCursor: string | null;
};

export async function historyPage(args: {
  channel: string;
  oldest: string;
  cursor?: string;
}): Promise<SlackHistoryPage> {
  const response = await callSlack("conversations.history", {
    channel: args.channel,
    oldest: args.oldest,
    limit: 200,
    ...(args.cursor ? { cursor: args.cursor } : {}),
  });
  return {
    messages:
      (response as SlackResponse & { messages?: SlackHistoryPage["messages"] })
        .messages ?? [],
    nextCursor: response.response_metadata?.next_cursor?.trim() || null,
  };
}
