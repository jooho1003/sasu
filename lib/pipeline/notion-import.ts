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

export type NotionImportResult = {
  inserted: number;
  updated: number;
  deleted: number;
};

type ExistingNotionItem = {
  id: string;
  external_ref: string | null;
  content: string;
  deleted_at: string | null;
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
  const client = createServiceSupabaseClient();
  const sourceResult = await client.from("sources").select("id, dept_id, external_id, title, active, kind").eq("id", sourceId).maybeSingle<SourceRow>();
  if (sourceResult.error) throw new NotionImportDatabaseError();
  const source = sourceResult.data;
  if (!source || source.kind !== "notion_page" || !source.active) {
    return { inserted: 0, updated: 0, deleted: 0 };
  }

  try {
    const page = await fetchNotionPage(source.external_id);
    const items = toNotionItems({ sourceId: source.id, deptId: source.dept_id, blocks: page.blocks });
    const existingResult = await client
      .from("items")
      .select("id, external_ref, content, deleted_at")
      .eq("source_id", source.id);
    if (existingResult.error) throw new NotionImportDatabaseError();

    const existingItems = (existingResult.data ?? []) as ExistingNotionItem[];
    const activeByExternalRef = new Map(
      existingItems
        .filter((item) => item.deleted_at === null && item.external_ref !== null)
        .map((item) => [item.external_ref as string, item]),
    );
    const incomingByExternalRef = new Map(items.map((item) => [item.external_ref, item]));
    const inserted = items.filter((item) => !activeByExternalRef.has(item.external_ref));
    const updated = items.filter((item) => activeByExternalRef.get(item.external_ref)?.content !== item.content && activeByExternalRef.has(item.external_ref));
    const changedRefs = new Set(updated.map((item) => item.external_ref));
    const rows = items.map((item) => changedRefs.has(item.external_ref)
      ? { ...item, deleted_at: null, embedding: null, embed_status: "pending" }
      : { ...item, deleted_at: null });
    const itemResult = await client.from("items").upsert(rows, { onConflict: "source_id,external_ref" }).select("id, external_ref");
    if (itemResult.error) throw new NotionImportDatabaseError();

    const removedIds = existingItems
      .filter((item) => item.deleted_at === null && !incomingByExternalRef.has(item.external_ref ?? ""))
      .map((item) => item.id);
    if (removedIds.length > 0) {
      const removalResult = await client
        .from("items")
        .update({ deleted_at: new Date().toISOString(), embedding: null })
        .in("id", removedIds);
      if (removalResult.error) throw new NotionImportDatabaseError();
    }

    const importedByExternalRef = new Map(
      (itemResult.data ?? []).map((item) => [item.external_ref, item.id]),
    );
    for (const item of [...inserted, ...updated]) {
      const itemId = importedByExternalRef.get(item.external_ref);
      if (!itemId) throw new NotionImportDatabaseError();
      await enqueue("classify", { itemId }, { dedupeKey: itemId });
    }
    for (const item of updated) {
      const itemId = importedByExternalRef.get(item.external_ref);
      if (!itemId) throw new NotionImportDatabaseError();
      await enqueue("embed", { itemId }, { dedupeKey: itemId });
    }
    const sourceUpdate = await client.from("sources").update({ title: page.title ?? source.title, last_synced_at: new Date().toISOString(), last_error: null }).eq("id", source.id);
    if (sourceUpdate.error) throw new NotionImportDatabaseError();
    return { inserted: inserted.length, updated: updated.length, deleted: removedIds.length };
  } catch (error) {
    if (error instanceof NotionImportDatabaseError) throw error;
    const code = error && typeof error === "object" ? Reflect.get(error, "error_code") : null;
    if (code === "notion_not_configured" || code === "notion_rate_limited" || code === "notion_api_failed") {
      await client.from("sources").update({ last_error: code }).eq("id", source.id);
      throw error;
    }
    throw new NotionImportDatabaseError();
  }
}

export function registerNotionImportHandler(): void {
  registerHandler("notion_import", async (payload: unknown) => {
    await importNotionSource(sourceIdFromPayload(payload));
  });
}
