import { embedText, embedTexts, formatVector } from "@/lib/embeddings";
import { registerHandler } from "@/lib/jobs";
import { mask } from "@/lib/mask";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type ItemSourceRow = {
  import_version: number;
  title: string | null;
};

type ItemRow = {
  content_version: number;
  id: string;
  content: string;
  deleted_at: string | null;
  sources: ItemSourceRow | ItemSourceRow[] | null;
};

type BatchItemRow = ItemRow & {
  dept_id: string;
};

type DecisionRow = {
  id: string;
  outcome: string;
  rationale: string;
};

class EmbedPipelineDatabaseError extends Error {
  constructor() {
    super("Embed pipeline database operation failed");
    this.name = "EmbedPipelineDatabaseError";
  }
}

export const EMBED_BATCH_SIZE = 64;
export const VOYAGE_4_LITE_BATCH_TOKEN_LIMIT = 1_000_000;
const VOYAGE_DOCUMENT_PROMPT = "Represent the document for retrieval: ";
const encoder = new TextEncoder();

function ensureNoDatabaseError(error: unknown): void {
  if (error) {
    throw new EmbedPipelineDatabaseError();
  }
}

function itemIdFromPayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("embed job payload is invalid");
  }
  const itemId = Reflect.get(payload, "itemId");
  if (typeof itemId !== "string" || itemId.length === 0) {
    throw new Error("embed job payload is invalid");
  }
  return itemId;
}

function decisionIdFromPayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("embed_decision job payload is invalid");
  }
  const decisionId = Reflect.get(payload, "decisionId");
  if (typeof decisionId !== "string" || decisionId.length === 0) {
    throw new Error("embed_decision job payload is invalid");
  }
  return decisionId;
}

function deptIdFromPayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("embed_batch job payload is invalid");
  }
  const deptId = Reflect.get(payload, "deptId");
  if (typeof deptId !== "string" || deptId.length === 0) {
    throw new Error("embed_batch job payload is invalid");
  }
  return deptId;
}

function itemSource(item: ItemRow): ItemSourceRow | null {
  return Array.isArray(item.sources) ? item.sources[0] ?? null : item.sources;
}

function itemEmbeddingInput(item: ItemRow): string {
  const source = itemSource(item);
  const maskedTitle = source?.import_version === 2 && source.title
    ? mask(source.title).trim()
    : "";
  return maskedTitle ? `${maskedTitle}\n${item.content}` : item.content;
}

function withinVoyageTokenBudget(rows: BatchItemRow[]): Array<{ item: BatchItemRow; input: string }> {
  const promptBytes = encoder.encode(VOYAGE_DOCUMENT_PROMPT).length;
  let bytes = 0;
  const selected: Array<{ item: BatchItemRow; input: string }> = [];
  for (const item of rows) {
    const input = itemEmbeddingInput(item);
    const inputBytes = encoder.encode(input).length + promptBytes;
    // A tokenizer cannot emit more tokens than the UTF-8 byte sequence it
    // tokenizes, so this is a conservative bound without logging input text.
    if (bytes + inputBytes > VOYAGE_4_LITE_BATCH_TOKEN_LIMIT) break;
    selected.push({ item, input });
    bytes += inputBytes;
  }
  return selected;
}

export async function embedItem(itemId: string, expectedVersion?: number): Promise<void> {
  const client = createServiceSupabaseClient();
  const itemResult = await client
    .from("items")
    .select("id, content, deleted_at, content_version, sources(title, import_version)")
    .eq("id", itemId)
    .maybeSingle<ItemRow>();
  ensureNoDatabaseError(itemResult.error);

  const item = itemResult.data;
  if (!item || item.deleted_at !== null || (expectedVersion !== undefined && expectedVersion !== item.content_version)) {
    return;
  }

  const result = await embedText(itemEmbeddingInput(item), { inputType: "document" });
  const updateResult = await client.rpc("complete_item_embedding", { p_item: item.id, p_version: item.content_version, p_embedding: formatVector(result.vector), p_model: result.model });
  ensureNoDatabaseError(updateResult.error);
}

export async function embedBatch(deptId: string): Promise<{ requeue: boolean }> {
  const client = createServiceSupabaseClient();
  const batchResult = await client
    .from("items")
    .select("id, dept_id, content, deleted_at, content_version, sources!inner(title, import_version, active)")
    .eq("dept_id", deptId)
    .eq("embed_status", "pending")
    .is("deleted_at", null)
    .eq("sources.import_version", 2)
    .eq("sources.active", true)
    .order("id")
    .limit(EMBED_BATCH_SIZE);
  ensureNoDatabaseError(batchResult.error);
  const selected = withinVoyageTokenBudget((batchResult.data ?? []) as BatchItemRow[]);
  if (selected.length > 0) {
    const result = await embedTexts(selected.map(entry => entry.input), "document");
    for (const [index, entry] of selected.entries()) {
      const completed = await client.rpc("complete_item_embedding", {
        p_item: entry.item.id,
        p_version: entry.item.content_version,
        p_embedding: formatVector(result.vectors[index]),
        p_model: result.model,
      });
      ensureNoDatabaseError(completed.error);
    }
  }

  const remaining = await client
    .from("items")
    .select("id, sources!inner(import_version, active)")
    .eq("dept_id", deptId)
    .eq("embed_status", "pending")
    .is("deleted_at", null)
    .eq("sources.import_version", 2)
    .eq("sources.active", true)
    .limit(1);
  ensureNoDatabaseError(remaining.error);
  return { requeue: (remaining.data ?? []).length > 0 };
}

export async function embedDecision(decisionId: string): Promise<void> {
  const client = createServiceSupabaseClient();
  const decisionResult = await client
    .from("decisions")
    .select("id, outcome, rationale")
    .eq("id", decisionId)
    .maybeSingle<DecisionRow>();
  ensureNoDatabaseError(decisionResult.error);

  const decision = decisionResult.data;
  if (!decision) {
    return;
  }

  const result = await embedText(`${decision.outcome}\n${decision.rationale}`, {
    inputType: "document",
  });
  const updateResult = await client
    .from("decisions")
    .update({
      embedding: formatVector(result.vector),
      embed_model: result.model,
    })
    .eq("id", decision.id);
  ensureNoDatabaseError(updateResult.error);
}

export function registerEmbedHandler(): void {
  registerHandler("embed", async (payload: unknown) => {
    const version = typeof payload === "object" && payload !== null ? Reflect.get(payload, "contentVersion") : undefined;
    await embedItem(itemIdFromPayload(payload), typeof version === "number" ? version : undefined);
  });
  registerHandler("embed_decision", async (payload: unknown) => {
    await embedDecision(decisionIdFromPayload(payload));
  });
  registerHandler("embed_batch", async (payload: unknown) =>
    embedBatch(deptIdFromPayload(payload)));
}
