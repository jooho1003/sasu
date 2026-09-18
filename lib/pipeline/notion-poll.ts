import { randomUUID } from "node:crypto";

import { enqueue, registerHandler } from "@/lib/jobs";
import {
  fetchNotionBlockParent,
  fetchNotionDataSourceParent,
  searchNotion,
  type NotionPageMeta,
  type NotionParent,
} from "@/lib/notion";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const POLL_LIMIT_MS = 40_000;

type PollClaim = {
  root_id: string;
  poll_watermark: string | null;
  poll_cursor: string | null;
  poll_offset: number;
  poll_started_at: string | null;
};
type Client = ReturnType<typeof createServiceSupabaseClient>;

function rootIdFromPayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) throw new Error("notion_poll job payload is invalid");
  const rootId = Reflect.get(payload, "rootId");
  if (typeof rootId !== "string" || !rootId) throw new Error("notion_poll job payload is invalid");
  return rootId;
}

async function rpc<T>(client: Client, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await client.rpc(name, args);
  if (result.error) throw new Error("Notion poll database operation failed");
  return result.data as T;
}

function newerThan(page: NotionPageMeta, watermark: string | null): boolean {
  if (!page.lastEditedTime) return false;
  return watermark === null || Date.parse(page.lastEditedTime) >= Date.parse(watermark);
}

function directParentId(parent: NotionParent): string | null {
  for (const key of ["page_id", "database_id"] as const) {
    const value = parent[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

async function directOrDataSourceParentId(
  parent: NotionParent,
): Promise<string | null> {
  const direct = directParentId(parent);
  if (direct) return direct;
  if (
    parent.type === "data_source_id" &&
    typeof parent.data_source_id === "string" &&
    parent.data_source_id.length > 0
  ) {
    return directParentId(
      await fetchNotionDataSourceParent(parent.data_source_id),
    );
  }
  return null;
}

async function resolveParentId(parent: NotionParent): Promise<string | null> {
  let current = parent;
  for (let depth = 0; depth < 5; depth += 1) {
    const direct = await directOrDataSourceParentId(current);
    if (direct) return direct;
    if (
      current.type !== "block_id" ||
      typeof current.block_id !== "string" ||
      current.block_id.length === 0
    ) {
      return null;
    }
    current = await fetchNotionBlockParent(current.block_id);
  }
  return directOrDataSourceParentId(current);
}

export async function pollNotionInstallation(
  rootId: string,
  options: { now?: () => number } = {},
): Promise<{ imports: number; continued: boolean }> {
  const client = createServiceSupabaseClient();
  const lease = randomUUID();
  const claim = await rpc<PollClaim | null>(client, "claim_notion_poll", { p_root: rootId, p_lease: lease });
  if (!claim) return { imports: 0, continued: false };

  const now = options.now ?? Date.now;
  const startedAt = now();
  const savedStartedAt = claim.poll_started_at === null
    ? Number.NaN
    : Date.parse(claim.poll_started_at);
  const cycleStartedAt = Number.isFinite(savedStartedAt)
    ? savedStartedAt
    : startedAt;
  let cursor: string | null = claim.poll_cursor;
  let offset = Number.isInteger(claim.poll_offset) && claim.poll_offset > 0
    ? claim.poll_offset
    : 0;
  let imports = 0;
  const completedWatermark = new Date(cycleStartedAt - 2 * 60_000).toISOString();

  while (true) {
    const response = await searchNotion({ cursor, sortByEditedDesc: true });
    for (let index = offset; index < response.results.length; index += 1) {
      const page = response.results[index];
      if (page.object !== "page" || page.inTrash) continue;
      if (!newerThan(page, claim.poll_watermark)) {
        await rpc(client, "finish_notion_poll", { p_root: rootId, p_lease: lease, p_watermark: completedWatermark });
        return { imports, continued: false };
      }
      const result = await rpc<string>(client, "poll_notion_page", {
        p_root: claim.root_id,
        p_page: page.id,
        p_parent: await resolveParentId(page.parent),
        p_remote_edited_at: page.lastEditedTime,
        p_title: page.title,
      });
      if (result === "import") imports += 1;
      if (now() - startedAt >= POLL_LIMIT_MS) {
        const completedPage = index + 1 >= response.results.length;
        if (completedPage && response.nextCursor === null) {
          await rpc(client, "finish_notion_poll", { p_root: rootId, p_lease: lease, p_watermark: completedWatermark });
          return { imports, continued: false };
        }
        await rpc(client, "save_notion_poll_cursor", {
          p_root: rootId,
          p_lease: lease,
          p_cursor: completedPage ? response.nextCursor : cursor,
          p_offset: completedPage ? 0 : index + 1,
          p_started_at: new Date(cycleStartedAt).toISOString(),
        });
        await enqueue("notion_poll", { rootId }, { lane: "bulk" });
        return { imports, continued: true };
      }
    }
    cursor = response.nextCursor;
    offset = 0;
    if (cursor === null) {
      await rpc(client, "finish_notion_poll", { p_root: rootId, p_lease: lease, p_watermark: completedWatermark });
      return { imports, continued: false };
    }
    if (now() - startedAt >= POLL_LIMIT_MS) {
      await rpc(client, "save_notion_poll_cursor", {
        p_root: rootId,
        p_lease: lease,
        p_cursor: cursor,
        p_offset: 0,
        p_started_at: new Date(cycleStartedAt).toISOString(),
      });
      await enqueue("notion_poll", { rootId }, { lane: "bulk" });
      return { imports, continued: true };
    }
  }
}

export function registerNotionPollHandler(): void {
  registerHandler("notion_poll", async (payload: unknown) => {
    await pollNotionInstallation(rootIdFromPayload(payload));
  });
}

export async function scheduleNotionPolls(): Promise<void> {
  await rpc(createServiceSupabaseClient(), "schedule_notion_polls", {});
}
