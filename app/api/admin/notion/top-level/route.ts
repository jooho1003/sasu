import { mask } from "@/lib/mask";
import { searchNotion } from "@/lib/notion";
import { withNotionForAdmin } from "@/lib/notion-workspace";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  try {
    const result = await withNotionForAdmin(supabase, () => searchNotion({}));
    // A root list is deliberately shallow: neither descendants nor their titles
    // are read into this response.
    return Response.json({
      results: result.results
        .filter((item) => item.parent.type === "workspace" && !item.inTrash)
        .map((item) => ({ id: item.id, title: mask(item.title ?? "제목 없는 항목").slice(0, 200), kind: item.object })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Notion 최상위 항목을 불러오지 못했습니다." }, { status: 403 });
  }
}
