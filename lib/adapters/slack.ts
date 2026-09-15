import { IngestItem, type IngestItem as IngestItemValue } from "@/lib/contracts";
import { mask } from "@/lib/mask";

export type SlackMessageEvent = {
  type?: string;
  channel?: string;
  channel_type?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
  subtype?: string;
  username?: string;
  files?: unknown[];
};

type SlackIngestContext = {
  sourceId: string;
  deptId: string;
  author?: string;
};

export type SlackMemberConsent = {
  displayName: string;
  consented: boolean;
};

const NON_MESSAGE_SUBTYPES = new Set([
  "bot_message",
  "channel_join",
  "channel_leave",
  "group_join",
  "group_leave",
]);

function hasMeaningfulText(text: string | undefined): boolean {
  if (!text?.trim()) {
    return false;
  }

  const withoutEmoji = text
    .replace(/:[+\-\w]+:/gu, "")
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u200D\uFE0E\uFE0F\u{1F3FB}-\u{1F3FF}]/gu, "")
    .trim();

  return withoutEmoji.length > 0;
}

function slackTimestampToIso(timestamp: string): string | null {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return new Date(seconds * 1_000).toISOString();
}

export function isCollectible(event: SlackMessageEvent): boolean {
  return (
    event.type === "message" &&
    typeof event.ts === "string" &&
    event.ts.length > 0 &&
    typeof event.user === "string" &&
    event.user.length > 0 &&
    !event.bot_id &&
    !NON_MESSAGE_SUBTYPES.has(event.subtype ?? "") &&
    hasMeaningfulText(event.text)
  );
}

export function toIngestItem(
  event: SlackMessageEvent,
  ctx: SlackIngestContext,
): IngestItemValue | null {
  if (!ctx.sourceId || !ctx.deptId || !isCollectible(event)) {
    return null;
  }

  return IngestItem.parse({
    source_id: ctx.sourceId,
    external_ref: event.ts,
    author_ext_id: event.user,
    author: ctx.author ?? event.user,
    spoken_at: slackTimestampToIso(event.ts as string),
    content: mask(event.text as string),
  });
}

export function collectBackfillItems(
  events: SlackMessageEvent[],
  ctx: {
    sourceId: string;
    deptId: string;
    members: Map<string, SlackMemberConsent>;
  },
): IngestItemValue[] {
  return events.flatMap((event) => {
    if (!event.user) {
      return [];
    }

    const member = ctx.members.get(event.user);
    if (!member?.consented) {
      return [];
    }

    const item = toIngestItem(event, {
      sourceId: ctx.sourceId,
      deptId: ctx.deptId,
      author: member.displayName,
    });
    return item ? [item] : [];
  });
}
