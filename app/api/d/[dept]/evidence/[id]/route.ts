import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ dept: string; id: string }> }) {
  const { dept, id } = await params;
  const membership = await requireMembership(dept);
  const client = await createServerSupabaseClient();
  const result = await client.from("items")
    .select("id, content, author, spoken_at, sources!inner(title, kind)")
    .eq("id", id).eq("dept_id", membership.deptId)
    .is("deleted_at", null).eq("sources.active", true).maybeSingle();
  if (result.error) return Response.json({ error: "원문을 불러오지 못했습니다. 잠시 후 다시 시도하세요." }, { status: 500 });
  if (!result.data) return Response.json({ error: "이 원문을 확인할 수 없습니다. 다시 질문해 주세요." }, { status: 404 });
  const source = Array.isArray(result.data.sources) ? result.data.sources[0] : result.data.sources;
  let highlight: string | null = null;
  const answer = new URL(request.url).searchParams.get("answer");
  if (answer && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(answer)) {
    try {
      // Session RLS decides whether this caller may see the answer's citation.
      const citation = await client.from("citations").select("quote")
        .eq("owner_kind", "answer").eq("owner_id", answer).eq("item_id", id).maybeSingle();
      const quote = citation.data?.quote;
      if (!citation.error && typeof quote === "string" && quote.length > 0 && result.data.content.includes(quote)) highlight = quote;
    } catch { /* Highlighting is optional; the source has already passed session RLS. */ }
  }
  return Response.json({ id: result.data.id, content: result.data.content, author: result.data.author, spoken_at: result.data.spoken_at, title: source?.title ?? "부서 기록", kind: source?.kind ?? null, highlight }, { headers: { "Cache-Control": "private, no-store" } });
}
