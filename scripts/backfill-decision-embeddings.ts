import { enqueue } from "@/lib/jobs";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const PAGE_SIZE = 100;

async function main(): Promise<void> {
  const client = createServiceSupabaseClient();
  let from = 0;

  for (;;) {
    const result = await client
      .from("decisions")
      .select("id")
      .is("embedding", null)
      .order("decided_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (result.error) {
      throw new Error("decision embedding backfill query failed");
    }

    const rows = result.data ?? [];
    for (const row of rows) {
      await enqueue("embed_decision", { decisionId: row.id }, { dedupeKey: row.id });
    }
    if (rows.length < PAGE_SIZE) break;
    from += rows.length;
  }
}

void main();
