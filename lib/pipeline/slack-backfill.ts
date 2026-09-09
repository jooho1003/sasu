import { collectBackfillItems, type SlackMemberConsent, type SlackMessageEvent } from "@/lib/adapters/slack";
import { enqueue, registerHandler } from "@/lib/jobs";
import { historyPage } from "@/lib/slack/post";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type SourceRow = {
  id: string;
  dept_id: string;
  external_id: string;
  kind: string;
  active: boolean;
  sync_cursor: string | null;
};

type MemberRow = {
  slack_user_id: string | null;
  display_name: string;
  consented_at: string | null;
};

type ItemIdRow = { id: string };

class SlackBackfillDatabaseError extends Error {
  constructor() {
    super("Slack backfill database operation failed");
    this.name = "SlackBackfillDatabaseError";
  }
}

function ensureNoDatabaseError(error: unknown): void {
  if (error) {
    throw new SlackBackfillDatabaseError();
  }
}

export function sevenDaysAgoUnixSeconds(now: Date = new Date()): string {
  return String(Math.floor((now.getTime() - 7 * 24 * 60 * 60 * 1_000) / 1_000));
}

function payloadSourceId(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("slack_backfill job payload is invalid");
  }
  const sourceId = Reflect.get(payload, "sourceId");
  if (typeof sourceId !== "string" || sourceId.length === 0) {
    throw new Error("slack_backfill job payload is invalid");
  }
  return sourceId;
}

export async function backfillSlackChannel(sourceId: string): Promise<number> {
  const client = createServiceSupabaseClient();
  const sourceResult = await client
    .from("sources")
    .select("id, dept_id, external_id, kind, active, sync_cursor")
    .eq("id", sourceId)
    .maybeSingle<SourceRow>();
  ensureNoDatabaseError(sourceResult.error);

  const source = sourceResult.data;
  if (!source || source.kind !== "slack_channel" || !source.active) {
    return 0;
  }

  const membersResult = await client
    .from("members")
    .select("slack_user_id, display_name, consented_at")
    .eq("dept_id", source.dept_id);
  ensureNoDatabaseError(membersResult.error);

  const members = new Map<string, SlackMemberConsent>();
  for (const member of (membersResult.data ?? []) as MemberRow[]) {
    if (member.slack_user_id) {
      members.set(member.slack_user_id, {
        displayName: member.display_name,
        consented: member.consented_at !== null,
      });
    }
  }

  let cursor = source.sync_cursor ?? undefined;
  let inserted = 0;
  do {
    const page = await historyPage({
      channel: source.external_id,
      oldest: sevenDaysAgoUnixSeconds(),
      ...(cursor ? { cursor } : {}),
    });
    const items = collectBackfillItems(page.messages as SlackMessageEvent[], {
      sourceId: source.id,
      deptId: source.dept_id,
      members,
    });

    if (items.length > 0) {
      const itemResult = await client
        .from("items")
        .upsert(
          items.map((item) => ({ ...item, dept_id: source.dept_id })),
          { onConflict: "source_id,external_ref" },
        )
        .select("id");
      ensureNoDatabaseError(itemResult.error);

      const itemIds = (itemResult.data ?? []) as ItemIdRow[];
      inserted += itemIds.length;
      for (const item of itemIds) {
        await enqueue("classify", { itemId: item.id }, { dedupeKey: item.id });
      }
    }

    cursor = page.nextCursor ?? undefined;
    const cursorResult = await client
      .from("sources")
      .update({ sync_cursor: cursor ?? null })
      .eq("id", source.id);
    ensureNoDatabaseError(cursorResult.error);
  } while (cursor);

  const syncedResult = await client
    .from("sources")
    .update({ sync_cursor: null, last_synced_at: new Date().toISOString(), last_error: null })
    .eq("id", source.id);
  ensureNoDatabaseError(syncedResult.error);

  return inserted;
}

export function registerSlackBackfillHandler(): void {
  registerHandler("slack_backfill", async (payload: unknown) => {
    await backfillSlackChannel(payloadSourceId(payload));
  });
}
