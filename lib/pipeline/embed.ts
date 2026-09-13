import { embedText, formatVector } from "@/lib/embeddings";
import { registerHandler } from "@/lib/jobs";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type ItemRow = {
  id: string;
  content: string;
  deleted_at: string | null;
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

export async function embedItem(itemId: string): Promise<void> {
  const client = createServiceSupabaseClient();
  const itemResult = await client
    .from("items")
    .select("id, content, deleted_at")
    .eq("id", itemId)
    .maybeSingle<ItemRow>();
  ensureNoDatabaseError(itemResult.error);

  const item = itemResult.data;
  if (!item || item.deleted_at !== null) {
    return;
  }

  const result = await embedText(item.content, { inputType: "document" });
  const updateResult = await client
    .from("items")
    .update({
      embedding: formatVector(result.vector),
      embed_model: result.model,
      embed_status: "done",
    })
    .eq("id", item.id);
  ensureNoDatabaseError(updateResult.error);
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
    await embedItem(itemIdFromPayload(payload));
  });
  registerHandler("embed_decision", async (payload: unknown) => {
    await embedDecision(decisionIdFromPayload(payload));
  });
}
