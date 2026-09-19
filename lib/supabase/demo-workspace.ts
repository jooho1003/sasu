import { createPublicSupabaseClient } from "./public";
import { DEMO_DEFAULT_DEPT_ID } from "@/lib/demo-access";
import { salesDemoRecords, type DemoWorkspaceData } from "@/lib/demo-workspace";

export async function readDemoWorkspace(dept: string): Promise<DemoWorkspaceData> {
  const client = createPublicSupabaseClient();
  const [sources, items, decisions] = await Promise.all([
    client.from("sources").select("id,title,kind").eq("dept_id", dept).eq("active", true),
    client.from("items").select("id,source_id,content,author,spoken_at").eq("dept_id", dept).is("deleted_at", null).order("spoken_at", { ascending: false, nullsFirst: false }),
    client.from("decisions").select("id,outcome,rationale").eq("dept_id", dept).order("decided_at", { ascending: false }),
  ]);
  if (sources.error || items.error || decisions.error) throw new Error("데모 문서 조회 실패");
  const ids = (decisions.data ?? []).map(row => row.id);
  const citations = ids.length ? await client.from("citations").select("owner_id,item_id,quote").eq("owner_kind", "decision").in("owner_id", ids) : { data: [], error: null };
  if (citations.error) throw new Error("데모 인용 조회 실패");
  const itemMap = new Map((items.data ?? []).map(row => [row.id, row]));
  const extra = dept === DEMO_DEFAULT_DEPT_ID ? salesDemoRecords : { sources: [], items: [], decisions: [] };
  return {
    sources: [...(sources.data ?? []).map(row => ({ ...row, title: row.title ?? "이름 없는 자료" })), ...extra.sources],
    items: [...(items.data ?? []).map(row => ({ ...row, label: "info" })), ...extra.items],
    decisions: [...(decisions.data ?? []).flatMap(row => {
      const valid = (citations.data ?? []).filter(c => c.owner_id === row.id && c.item_id && itemMap.get(c.item_id)?.content.includes(c.quote));
      const citation = valid[0];
      return citation ? [{ ...row, source_id: itemMap.get(citation.item_id!)!.source_id, source_ids: [...new Set(valid.map(c => itemMap.get(c.item_id!)!.source_id))], quote: citation.quote, status: "decided" as const }] : [];
    }), ...extra.decisions],
  };
}
