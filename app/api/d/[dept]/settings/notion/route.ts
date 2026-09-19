import { enqueue, kickWorker } from "@/lib/jobs";
import { normalizeNotionPageId } from "@/lib/notion";
import { withNotionForDepartment } from "@/lib/notion-workspace";
import { registerNotionImportHandler } from "@/lib/pipeline/notion-import";
import { registerNotionDiscoverHandler } from "@/lib/pipeline/notion-discover";
import { metadataBase } from "@/lib/site";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const NOTION_PAGE_SIZE = 200;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  const requestedPage = Number(new URL(request.url).searchParams.get("page") ?? "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const from = (page - 1) * NOTION_PAGE_SIZE;
  const supabase = await createServerSupabaseClient();
  const sourcesQuery = supabase
    .from("sources")
    .select(
      "id, root_id, external_id, title, visibility, active, last_synced_at, last_error, parent_external_id, ingest_mode",
      { count: "exact" },
    )
    .eq("dept_id", membership.deptId)
    .eq("kind", "notion_page")
    .not("root_id", "is", null)
    .order("created_at", { ascending: true })
    .range(from, from + NOTION_PAGE_SIZE - 1);
  const rootsQuery = membership.role === "lead"
    ? supabase
        .from("notion_roots")
        .select("id, top_title, state, visibility, card_candidates")
        .eq("dept_id", membership.deptId)
        .neq("state", "disabled")
        .order("created_at", { ascending: true })
    : Promise.resolve({ data: [], error: null });
  const [sources, roots] = await Promise.all([sourcesQuery, rootsQuery]);
  if (sources.error || roots.error) {
    return Response.json(
      { error: "자동 수집 문서를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
  const total = sources.count ?? 0;
  return Response.json(
    {
      role: membership.role,
      sources: sources.data ?? [],
      roots: roots.data ?? [],
      page,
      page_size: NOTION_PAGE_SIZE,
      total,
      total_pages: Math.max(1, Math.ceil(total / NOTION_PAGE_SIZE)),
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") {
    return Response.json(
      { error: "자동 수집 설정은 팀장만 변경할 수 있습니다." },
      { status: 403 },
    );
  }
  if (request.headers.get("origin") !== metadataBase().origin) {
    return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  }
  let body: {
    action?: unknown;
    source_id?: unknown;
    root_id?: unknown;
    subtree?: unknown;
    enabled?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const supabase = await createServerSupabaseClient();

  if (body.action === "card_candidates") {
    if (typeof body.root_id !== "string" || typeof body.enabled !== "boolean") {
      return Response.json({ error: "카드 후보 설정을 확인해주세요." }, { status: 400 });
    }
    const result = await supabase.rpc("set_notion_root_card_candidates", {
      p_root: body.root_id,
      p_enabled: body.enabled,
    });
    if (result.error) {
      return Response.json(
        { error: result.error.code === "42501" ? "권한이 없습니다." : "카드 후보 설정을 저장하지 못했습니다." },
        { status: result.error.code === "42501" ? 403 : 500 },
      );
    }
    return Response.json({ ok: true });
  }

  if (typeof body.source_id !== "string") {
    return Response.json({ error: "자동 수집 문서를 확인해주세요." }, { status: 400 });
  }
  const source = await supabase
    .from("sources")
    .select("id, external_id, root_id")
    .eq("id", body.source_id)
    .eq("dept_id", membership.deptId)
    .eq("kind", "notion_page")
    .not("root_id", "is", null)
    .maybeSingle<{ id: string; external_id: string; root_id: string }>();
  if (source.error) {
    return Response.json({ error: "자동 수집 문서를 확인하지 못했습니다." }, { status: 500 });
  }
  if (!source.data) {
    return Response.json({ error: "자동 수집 문서를 찾지 못했습니다." }, { status: 404 });
  }

  if (body.action === "exclude") {
    if (typeof body.subtree !== "boolean") {
      return Response.json({ error: "하위 문서 제외 설정을 확인해주세요." }, { status: 400 });
    }
    const result = await supabase.rpc("set_notion_exclusion", {
      p_dept: membership.deptId,
      p_notion_id: source.data.external_id,
      p_subtree: body.subtree,
      p_excluded: true,
    });
    if (result.error) {
      return Response.json(
        { error: result.error.code === "42501" ? "권한이 없습니다." : "문서를 제외하지 못했습니다." },
        { status: result.error.code === "42501" ? 403 : 500 },
      );
    }
    return Response.json({ ok: true });
  }

  if (body.action === "restrict") {
    const result = await supabase
      .from("sources")
      .update({ visibility: "leads_only" })
      .eq("id", source.data.id)
      .eq("dept_id", membership.deptId);
    if (result.error) {
      return Response.json(
        { error: result.error.code === "42501" ? "권한이 없습니다." : "볼 수 있는 사람을 바꾸지 못했습니다. 다시 시도하세요." },
        { status: result.error.code === "42501" ? 403 : 500 },
      );
    }
    return Response.json({ ok: true });
  }

  return Response.json({ error: "지원하지 않는 작업입니다." }, { status: 400 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") return Response.json({ error: "노션 원칙 문서는 팀장만 연결할 수 있습니다." }, { status: 403 });

  let body: { source_id?: unknown; page_id?: unknown; title?: unknown; visibility?: unknown; auto_sync?: unknown; convert_v2?: unknown; include_children?: unknown };
  try {
    body = (await request.json()) as { source_id?: unknown; page_id?: unknown; title?: unknown; visibility?: unknown; auto_sync?: unknown; convert_v2?: unknown; include_children?: unknown };
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const pageLines = typeof body.page_id === "string"
    ? body.page_id.split(/\r?\n/u).map(value => value.trim()).filter(Boolean)
    : [];
  if (typeof body.source_id !== "string" && pageLines.length > 50) {
    return Response.json({ error: "노션 페이지는 한 번에 최대 50개까지 등록할 수 있습니다." }, { status: 400 });
  }
  if (body.include_children !== undefined && typeof body.include_children !== "boolean") {
    return Response.json({ error: "하위 페이지 포함 설정을 확인해주세요." }, { status: 400 });
  }
  const supabase = await createServerSupabaseClient();
  try {
    await withNotionForDepartment(
      supabase,
      membership.deptId,
      async () => undefined,
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      Reflect.get(error, "error_code") === "notion_not_configured"
    ) {
      return Response.json(
        { error: "조직 관리자가 노션 부서 메뉴를 먼저 연결해야 합니다." },
        { status: 409 },
      );
    }
    return Response.json(
      { error: "노션 연결을 확인하지 못했습니다." },
      { status: 500 },
    );
  }
  if (typeof body.source_id === "string") {
    const sourceResult = await supabase
      .from("sources")
      .select("id, kind, active")
      .eq("id", body.source_id)
      .eq("dept_id", membership.deptId)
      .maybeSingle<{ id: string; kind: string; active: boolean }>();
    if (sourceResult.error) return Response.json({ error: "노션 연결을 확인하지 못했습니다." }, { status: 500 });
    if (!sourceResult.data || sourceResult.data.kind !== "notion_page" || !sourceResult.data.active) {
      return Response.json({ error: "활성 노션 원칙 문서를 찾지 못했습니다." }, { status: 404 });
    }

    if (body.convert_v2 === true) {
      const converted = await supabase.rpc("convert_notion_source_v2", { p_source: sourceResult.data.id });
      if (converted.error) return Response.json({ error: "새 가져오기 방식으로 전환하지 못했습니다." }, { status: 500 });
      registerNotionImportHandler();
      kickWorker();
      return Response.json({ ok: true, source_id: sourceResult.data.id }, { status: 202 });
    }

    if (body.auto_sync !== undefined) {
      if (typeof body.auto_sync !== "boolean") return Response.json({ error: "자동 새로 고침 설정을 확인해주세요." }, { status: 400 });
      const setting = await supabase.rpc("set_notion_auto_sync", { p_source: sourceResult.data.id, p_enabled: body.auto_sync });
      if (setting.error) return Response.json({ error: "자동 새로 고침 설정을 저장하지 못했습니다." }, { status: 500 });
      if (body.auto_sync) kickWorker();
      return Response.json({ ok: true });
    }

    registerNotionImportHandler();
    const jobId = await enqueue("notion_import", { sourceId: sourceResult.data.id }, { dedupeKey: `${sourceResult.data.id}:${Date.now()}` });
    kickWorker();
    return Response.json({ ok: true, source_id: sourceResult.data.id, job_id: jobId }, { status: 202 });
  }

  if (pageLines.length === 0) return Response.json({ error: "노션 페이지 고유번호를 입력해주세요." }, { status: 400 });

  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : "노션 원칙 문서";
  const visibility = body.visibility === "leads_only" ? "leads_only" : "dept";
  const includeChildren = body.include_children === true;
  if (includeChildren) registerNotionDiscoverHandler();
  else registerNotionImportHandler();
  const queued = new Set<string>();
  const results: Array<{ input: string; status: "created" | "existing" | "error"; source_id?: string; root_id?: string; error?: string }> = [];
  for (const input of pageLines) {
    let pageId: string;
    try {
      pageId = normalizeNotionPageId(input);
    } catch {
      results.push({ input, status: "error", error: "노션 페이지 주소 또는 고유번호를 확인해주세요." });
      continue;
    }

    if (includeChildren) {
      const root = await supabase.rpc("lead_upsert_notion_root", {
        p_dept: membership.deptId,
        p_notion_id: pageId,
        p_kind: "page",
        p_visibility: visibility,
      });
      if (root.error || typeof root.data !== "string") {
        results.push({ input, status: "error", error: "노션 수집 범위를 저장하지 못했습니다." });
        continue;
      }
      try {
        if (!queued.has(root.data)) {
          await enqueue("notion_discover", { rootId: root.data }, { dedupeKey: `${root.data}:${Date.now()}` });
          queued.add(root.data);
        }
        results.push({ input, status: "created", root_id: root.data });
      } catch {
        results.push({ input, status: "error", root_id: root.data, error: "노션 발견을 예약하지 못했습니다." });
      }
      continue;
    }

    const existing = await supabase.from("sources").select("id").eq("dept_id", membership.deptId).eq("kind", "notion_page").eq("external_id", pageId).eq("active", true).maybeSingle<{ id: string }>();
    if (existing.error) {
      results.push({ input, status: "error", error: "기존 노션 연결을 확인하지 못했습니다." });
      continue;
    }
    let sourceId = existing.data?.id;
    let status: "created" | "existing" = sourceId ? "existing" : "created";
    if (!sourceId) {
      const inserted = await supabase.from("sources").insert({
        dept_id: membership.deptId,
        kind: "notion_page",
        external_id: pageId,
        title,
        visibility,
        is_principles: true,
        active: true,
        import_version: 2,
        ingest_mode: "classify",
      }).select("id").single<{ id: string }>();
      if (inserted.error?.code === "23505") {
        const concurrent = await supabase.from("sources").select("id").eq("dept_id", membership.deptId).eq("kind", "notion_page").eq("external_id", pageId).eq("active", true).maybeSingle<{ id: string }>();
        sourceId = concurrent.data?.id;
        status = "existing";
      } else if (!inserted.error) {
        sourceId = inserted.data?.id;
      }
      if (!sourceId) {
        results.push({ input, status: "error", error: "노션 연결을 저장하지 못했습니다." });
        continue;
      }
    }

    try {
      if (!queued.has(sourceId)) {
        await enqueue("notion_import", { sourceId }, { dedupeKey: `${sourceId}:${Date.now()}` });
        queued.add(sourceId);
      }
      results.push({ input, status, source_id: sourceId });
    } catch {
      results.push({ input, status: "error", source_id: sourceId, error: "노션 가져오기를 예약하지 못했습니다." });
    }
  }
  if (queued.size > 0) kickWorker();
  return Response.json({ ok: results.some(result => result.status !== "error"), results }, { status: 202 });
}
