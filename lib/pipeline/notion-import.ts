import { randomUUID } from "node:crypto";
import { extractNotionText, fetchNotionPage, type NotionBlock } from "@/lib/notion";
import { registerHandler } from "@/lib/jobs";
import { mask } from "@/lib/mask";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type SourceRow = { id: string; dept_id: string; external_id: string; title: string | null; active: boolean; kind: string };

export type NotionItem = {
  source_id: string;
  dept_id: string;
  external_ref: string;
  author_ext_id: null;
  author: string;
  spoken_at: null;
  content: string;
};

export type NotionImportResult = {
  inserted: number;
  updated: number;
  deleted: number;
};

export function toNotionItems(args: { sourceId: string; deptId: string; blocks: NotionBlock[] }): NotionItem[] {
  return args.blocks.flatMap((block, index) => {
    const content = mask(extractNotionText(block));
    if (!content) return [];
    return [{
      source_id: args.sourceId,
      dept_id: args.deptId,
      external_ref: typeof block.id === "string" && block.id ? block.id : `block-${index + 1}`,
      author_ext_id: null,
      author: "Notion",
      spoken_at: null,
      content,
    }];
  });
}

class NotionImportDatabaseError extends Error {
  constructor() {
    super("Notion import database operation failed");
    this.name = "NotionImportDatabaseError";
  }
}

function sourceIdFromPayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) throw new Error("notion_import job payload is invalid");
  const sourceId = Reflect.get(payload, "sourceId");
  if (typeof sourceId !== "string" || !sourceId) throw new Error("notion_import job payload is invalid");
  return sourceId;
}

export async function importNotionSource(sourceId: string): Promise<NotionImportResult> {
  const empty = { inserted: 0, updated: 0, deleted: 0 };
  const client = createServiceSupabaseClient();
  const sourceResult = await client.from("sources").select("id, dept_id, external_id, title, active, kind").eq("id", sourceId).maybeSingle<SourceRow>();
  if (sourceResult.error) throw new NotionImportDatabaseError();
  const source = sourceResult.data;
  if (!source || source.kind !== "notion_page" || !source.active) return empty;
  const lease = randomUUID();
  const claimed = await client.rpc("begin_notion_sync", { p_source: sourceId, p_lease: lease });
  if (claimed.error) throw new NotionImportDatabaseError();
  if (claimed.data !== true) return empty;
  try {
    const page = await fetchNotionPage(source.external_id);
    const items = toNotionItems({ sourceId: source.id, deptId: source.dept_id, blocks: page.blocks });
    const result = await client.rpc("finish_notion_sync", {
      p_source: sourceId, p_lease: lease,
      p_items: items.map(item => ({ external_ref: item.external_ref, content: item.content })),
      p_title: page.title === null ? null : mask(page.title),
    });
    if (result.error) throw new NotionImportDatabaseError();
    return result.data as NotionImportResult | null ?? empty;
  } catch (error) {
    const code = error && typeof error === "object" ? Reflect.get(error, "error_code") : null;
    const safeCode = ["notion_not_configured", "notion_rate_limited", "notion_api_failed"].includes(String(code)) ? String(code) : "notion_api_failed";
    const released = await client.rpc("release_notion_sync", { p_source: sourceId, p_lease: lease, p_error: safeCode });
    if (released.error) throw new NotionImportDatabaseError();
    if (code) throw error;
    throw new NotionImportDatabaseError();
  }
}

export function registerNotionImportHandler(): void {
  registerHandler("notion_import", async (payload: unknown) => {
    await importNotionSource(sourceIdFromPayload(payload));
  });
}

export async function scheduleNotionSync(): Promise<void> {
  const result = await createServiceSupabaseClient().rpc("schedule_source_syncs");
  if (result.error) throw new NotionImportDatabaseError();
}
