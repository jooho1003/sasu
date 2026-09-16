import { collectBackfillItems, type SlackMemberConsent, type SlackMessageEvent } from "@/lib/adapters/slack";
import { registerHandler } from "@/lib/jobs";
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

    for (const item of items) {
      const editedAt = (page.messages as SlackMessageEvent[]).find(message => message.ts === item.external_ref)?.edited?.ts;
      if (editedAt && /^\d{1,12}\.\d{1,6}$/.test(editedAt)) {
        const changed = await client.rpc("apply_slack_change", {
          p_event: `backfill:${source.id}:${item.external_ref}:${editedAt}`, p_source: source.id,
          p_ref: item.external_ref, p_changed_at: editedAt, p_author: item.author_ext_id,
          p_content: item.content, p_deleted: false,
        });
        ensureNoDatabaseError(changed.error);
        if (changed.data === true) inserted++;
        continue;
      }
      const result = await client.rpc("ingest_slack_atomic", {
        p_event_id: `backfill:${source.id}:${item.external_ref}`, p_source_id: source.id,
        p_author_ext_id: item.author_ext_id, p_kind: "item", p_content: item.content,
        p_external_ref: item.external_ref, p_spoken_at: item.spoken_at, p_thread_ts: null,
      });
      ensureNoDatabaseError(result.error);
      if (result.data === true) inserted++;
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
