import { mask } from "@/lib/mask";

export type SlackChange = {
  kind: "edit" | "delete";
  channel: string;
  externalRef: string;
  changedAt: string;
  authorId: string | null;
  content: string | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,12}\.\d{1,6}$/.test(value);
}

/** previous_message is deliberately never copied: deleted/unedited text must not be persisted. */
export function parseSlackChange(input: unknown): SlackChange | null {
  const event = record(input);
  if (event.type !== "message" || event.channel_type === "im" || event.channel_type === "mpim" || typeof event.channel !== "string" || !/^[CG][A-Z0-9]+$/.test(event.channel)) return null;
  if (event.subtype === "message_deleted") {
    const changedAt = event.event_ts ?? event.ts;
    if (!timestamp(event.deleted_ts) || !timestamp(changedAt)) return null;
    return { kind: "delete", channel: event.channel, externalRef: event.deleted_ts, changedAt, authorId: null, content: null };
  }
  if (event.subtype !== "message_changed") return null;
  const message = record(event.message);
  const changedAt = record(message.edited).ts ?? event.event_ts ?? event.ts;
  if (message.bot_id || typeof message.user !== "string" || !/^U[A-Z0-9]+$/.test(message.user) || typeof message.text !== "string" || !timestamp(message.ts) || !timestamp(changedAt)) return null;
  return { kind: "edit", channel: event.channel, externalRef: message.ts, changedAt, authorId: message.user, content: mask(message.text) };
}
