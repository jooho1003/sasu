import { enqueue, kickWorker } from "@/lib/jobs";
import { registerNotionDiscoverHandler } from "@/lib/pipeline/notion-discover";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { metadataBase } from "@/lib/site";

export async function GET() {
  const client = await createServerSupabaseClient();
  const result = await client.rpc("admin_notion_roots");
  return result.error
    ? Response.json({ error: "forbidden" }, { status: 403 })
    : Response.json({ roots: result.data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== metadataBase().origin) {
    return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const client = await createServerSupabaseClient();
  const result = await client.rpc("admin_upsert_notion_root", { p_dept: body.dept, p_scope: body.scope, p_notion_id: body.notion_id, p_kind: body.kind, p_top_title: body.title, p_visibility: body.visibility, p_include_new: body.include_new });
  if (!result.error && typeof result.data === "string") {
    try {
      registerNotionDiscoverHandler();
      await enqueue("notion_discover", { rootId: result.data }, { dedupeKey: `${result.data}:${Date.now()}` });
      kickWorker();
      return Response.json({ rootId: result.data }, { status: 202 });
    } catch {
      return Response.json({ error: "수집 범위는 저장했지만 발견 작업을 예약하지 못했습니다." }, { status: 503 });
    }
  }
  if (!result.error) {
    return Response.json({ error: "수집 범위를 저장하지 못했습니다." }, { status: 500 });
  }
  const missing = /^consent_required:(\d+)$/u.exec(result.error.message ?? "")?.[1];
  return Response.json({ error: "수집 범위를 저장하지 못했습니다.", ...(missing ? { missing: Number(missing) } : {}) }, { status: result.error.code === "P0001" ? 409 : 403 });
}
