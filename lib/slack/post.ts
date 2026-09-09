import type { SlackBlock } from "@/lib/slack/blocks";

type SlackApiErrorCode =
  | "slack_not_configured"
  | "slack_rate_limited"
  | "slack_api_failed"
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
};

const SLACK_API_URL = "https://slack.com/api";
const MAX_RATE_LIMIT_RETRIES = 3;

function token(): string {
  const value = process.env.SLACK_BOT_TOKEN?.trim();
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
  if (status === 429 || response.error === "ratelimited") {
    return new SlackApiError("slack_rate_limited");
  }
  if (response.error === "channel_not_found" || response.error === "user_not_found") {
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
    if (error.error_code !== "slack_rate_limited" || attempt === MAX_RATE_LIMIT_RETRIES - 1) {
      throw error;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, retryAfter(response) * 1_000);
    });
  }

  throw new SlackApiError("slack_api_failed");
}

export async function openDirectMessage(userId: string): Promise<{ id: string }> {
  const response = await callSlack("conversations.open", { users: userId });
  const channel = response.channel;
  const channelId =
    typeof channel === "string" ? channel : channel?.id;
  if (!channelId) {
    throw new SlackApiError("slack_dm_unavailable");
  }
  return { id: channelId };
}

export async function postMessage(args: {
  channel: string;
  text: string;
  blocks: SlackBlock[];
}): Promise<{ channel: string; ts: string }> {
  const response = await callSlack("chat.postMessage", args);
  if (!response.channel || typeof response.channel !== "string" || !response.ts) {
    throw new SlackApiError("slack_api_failed");
  }
  return { channel: response.channel, ts: response.ts };
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
}): Promise<void> {
  await callSlack("chat.update", args);
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
    messages: (response as SlackResponse & { messages?: SlackHistoryPage["messages"] }).messages ?? [],
    nextCursor:
      response.response_metadata?.next_cursor?.trim() || null,
  };
}
