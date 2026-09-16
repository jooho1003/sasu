import { enqueue, kickWorker } from "@/lib/jobs";
import { normalizeNotionPageId } from "@/lib/notion";
import { registerNotionImportHandler } from "@/lib/pipeline/notion-import";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") return Response.json({ error: "Notion 원칙 문서는 팀장만 연결할 수 있습니다." }, { status: 403 });

  let body: { source_id?: unknown; page_id?: unknown; title?: unknown; visibility?: unknown; auto_sync?: unknown };
  try {
    body = (await request.json()) as { source_id?: unknown; page_id?: unknown; title?: unknown; visibility?: unknown };
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const supabase = await createServerSupabaseClient();
  if (typeof body.source_id === "string") {
    const sourceResult = await supabase
      .from("sources")
      .select("id, kind, active")
      .eq("id", body.source_id)
      .eq("dept_id", membership.deptId)
      .maybeSingle<{ id: string; kind: string; active: boolean }>();
    if (sourceResult.error) return Response.json({ error: "Notion 연결을 확인하지 못했습니다." }, { status: 500 });
    if (!sourceResult.data || sourceResult.data.kind !== "notion_page" || !sourceResult.data.active) {
      return Response.json({ error: "활성 Notion 원칙 문서를 찾지 못했습니다." }, { status: 404 });
    }

    if (body.auto_sync !== undefined) {
      if (typeof body.auto_sync !== "boolean") return Response.json({ error: "자동 갱신 설정을 확인해주세요." }, { status: 400 });
      const setting = await supabase.rpc("set_notion_auto_sync", { p_source: sourceResult.data.id, p_enabled: body.auto_sync });
      if (setting.error) return Response.json({ error: "자동 갱신 설정을 저장하지 못했습니다." }, { status: 500 });
      if (body.auto_sync) kickWorker();
      return Response.json({ ok: true });
    }

    registerNotionImportHandler();
    const jobId = await enqueue("notion_import", { sourceId: sourceResult.data.id }, { dedupeKey: `${sourceResult.data.id}:${Date.now()}` });
    kickWorker();
    return Response.json({ ok: true, source_id: sourceResult.data.id, job_id: jobId }, { status: 202 });
  }

  if (typeof body.page_id !== "string") return Response.json({ error: "Notion 페이지 ID를 입력해주세요." }, { status: 400 });

  let pageId: string;
  try {
    pageId = normalizeNotionPageId(body.page_id);
  } catch {
    return Response.json({ error: "Notion 페이지 URL 또는 ID를 확인해주세요." }, { status: 400 });
  }
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : "Notion 원칙 문서";
  const visibility = body.visibility === "leads_only" ? "leads_only" : "dept";
  const existing = await supabase.from("sources").select("id").eq("dept_id", membership.deptId).eq("kind", "notion_page").eq("external_id", pageId).maybeSingle<{ id: string }>();
  if (existing.error) return Response.json({ error: "기존 Notion 연결을 확인하지 못했습니다." }, { status: 500 });
  const sourceResult = existing.data
    ? await supabase.from("sources").update({ title, visibility, is_principles: true, active: true, last_error: null }).eq("id", existing.data.id).select("id").single<{ id: string }>()
    : await supabase.from("sources").insert({ dept_id: membership.deptId, kind: "notion_page", external_id: pageId, title, visibility, is_principles: true, active: true }).select("id").single<{ id: string }>();
  if (sourceResult.error || !sourceResult.data) return Response.json({ error: "Notion 연결을 저장하지 못했습니다." }, { status: 500 });

  registerNotionImportHandler();
  const jobId = await enqueue("notion_import", { sourceId: sourceResult.data.id }, { dedupeKey: `${sourceResult.data.id}:${Date.now()}` });
  kickWorker();
  return Response.json({ ok: true, source_id: sourceResult.data.id, job_id: jobId }, { status: 202 });
}
