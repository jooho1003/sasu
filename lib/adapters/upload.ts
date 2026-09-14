import { mask } from "@/lib/mask";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type UploadItem = {
  source_id: string;
  dept_id: string;
  external_ref: string;
  author_ext_id: string | null;
  author: string;
  spoken_at: string | null;
  content: string;
};

// ADR-042: HTTP callers must first verify lead membership, non-demo status,
// source creation through session RLS, and (for speech) each author's consent.
// Never accepts a client or performs privileged reads/metadata writes.
export async function insertUploadedItems(items: readonly UploadItem[]) {
  const maskedItems = items.map(item => ({ ...item, content: mask(item.content) }));
  return createServiceSupabaseClient().from("items").insert(maskedItems).select("id");
}
