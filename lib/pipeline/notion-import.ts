import { extractNotionText, fetchNotionPage, type NotionBlock } from "@/lib/notion";
import { enqueue, registerHandler } from "@/lib/jobs";
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

export async function importNotionSource(sourceId: string): Promise<number> {
  const client = createServiceSupabaseClient();
  const sourceResult = await client.from("sources").select("id, dept_id, external_id, title, active, kind").eq("id", sourceId).maybeSingle<SourceRow>();
  if (sourceResult.error) throw new NotionImportDatabaseError();
  const source = sourceResult.data;
  if (!source || source.kind === "meeting" || !source.active) return 0;

  try {
    const page = await fetchNotionPage(source.external_id);
    const items = toNotionItems({ sourceId: source.id, deptId: source.dept_id, blocks: page.blocks });
    if (items.length === 0) {
      await client.from("sources").update({ last_error: "notion_empty" }).eq("id", source.id);
      return 0;
    }
    const itemResult = await client.from("items").upsert(items, { onConflict: "source_id,external_ref" }).select("id");
    if (itemResult.error) throw new NotionImportDatabaseError();
    for (const item of (itemResult.data ?? []) as Array<{ id: string }>) {
      await enqueue("classify", { itemId: item.id }, { dedupeKey: item.id });
    }
    await client.from("sources").update({ title: page.title ?? source.title, last_synced_at: new Date().toISOString(), last_error: null }).eq("id", source.id);
    return itemResult.data?.length ?? 0;
  } catch (error) {
    if (error instanceof NotionImportDatabaseError) throw error;
    const code = error && typeof error === "object" ? Reflect.get(error, "error_code") : null;
    if (code === "notion_not_configured" || code === "notion_rate_limited" || code === "notion_api_failed") throw error;
    throw new NotionImportDatabaseError();
  }
}

export function registerNotionImportHandler(): void {
  registerHandler("notion_import", async (payload: unknown) => {
    await importNotionSource(sourceIdFromPayload(payload));
  });
}
