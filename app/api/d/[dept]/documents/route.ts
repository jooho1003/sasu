import { createHash, randomUUID } from "node:crypto";

import { validateDocumentUpload } from "@/lib/adapters/document";
import { DocumentSummary } from "@/lib/contracts";
import { reviewError } from "@/lib/reviews";
import { kickWorker } from "@/lib/jobs";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { reviewCitationTarget, type PublishedReview, type ReviewCitationTarget } from "@/lib/recording/citation-location";

function documentErrorMessage(error: string): string {
  if (error === "unsupported_document_format") return ".txt 파일, .md 파일, .csv 파일, .json 파일, .pdf 파일, .docx 파일만 업로드할 수 있습니다.";
  if (error === "document_too_large") return "문서는 20메가바이트 이하이어야 합니다.";
  if (error === "document_empty") return "빈 문서는 업로드할 수 없습니다.";
  return "문서를 처리하지 못했습니다.";
}

function relationValue<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  const supabase = await createServerSupabaseClient();
  const result = await supabase
    .from("document_summaries")
    .select("source_id, status, summary, status_reason, extracted_chars, chunk_count, created_at, updated_at, sources!inner(title, visibility)")
    .eq("dept_id", membership.deptId).eq("sources.active", true)
    .order("created_at", { ascending: false });

  if (result.error) return Response.json({ error: "문서 목록을 불러오지 못했습니다." }, { status: 500 });

  const summaries = new Map((result.data ?? []).map((row) => [row.source_id, DocumentSummary.safeParse(row.summary).data ?? null]));
  const citationIds = [...new Set([...summaries.values()].flatMap((summary) => summary?.citations.flatMap((citation) => citation.item_id ? [citation.item_id] : []) ?? []))];
  const itemResult = citationIds.length
    ? await supabase.from("items").select("id,source_id,external_ref").eq("dept_id", membership.deptId).is("deleted_at", null).in("id", citationIds)
    : { data: [], error: null };
  const reviewSources = [...new Set((itemResult.error ? [] : itemResult.data ?? []).map((item) => item.source_id))];
  const reviewResult = reviewSources.length
    ? await supabase.from("reviewed_materials").select("id,kind,revision,published_revision,published_source_id,original_uploaded,original_deleted_at,deleted_at,sections")
      .in("published_source_id", reviewSources)
    : { data: [], error: null };
  // Both reads use the caller's session and RLS. A failed optional location lookup keeps the text citation.
  const reviews = new Map(((reviewResult.error ? [] : reviewResult.data) ?? []).map((review) => [review.published_source_id, review as PublishedReview]));
  const targets = new Map<string, { sourceId: string; target: ReviewCitationTarget }>();
  for (const item of itemResult.error ? [] : itemResult.data ?? []) {
    const review = reviews.get(item.source_id);
    const target = review ? reviewCitationTarget(item.external_ref, review) : null;
    if (target) targets.set(item.id, { sourceId: item.source_id, target });
  }

  return Response.json({
    documents: (result.data ?? []).map((row) => {
      const source = relationValue(row.sources as { title: string | null; visibility: "dept" | "leads_only" } | Array<{ title: string | null; visibility: "dept" | "leads_only" }>);
      return {
        id: row.source_id,
        title: source.title,
        visibility: source.visibility,
        status: row.status,
        status_reason: row.status_reason,
        // 계약과 다른 저장값은 화면에 넘기지 않는다. 화면은 null을 "근거 없음"으로 표시한다.
        summary: summaries.get(row.source_id) ?? null,
        citation_targets: Object.fromEntries((summaries.get(row.source_id)?.citations ?? []).flatMap((citation) => {
          const entry = citation.item_id ? targets.get(citation.item_id) : null;
          if (!entry || entry.sourceId !== row.source_id || !citation.item_id) return [];
          return [[citation.item_id, entry.target]];
        })),
        extracted_chars: row.extracted_chars,
        chunk_count: row.chunk_count,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    }),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") return Response.json({ error: "문서 업로드는 팀장만 할 수 있습니다." }, { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "문서 파일을 선택해주세요." }, { status: 400 });
  const validation = validateDocumentUpload({ filename: file.name, mimeType: file.type, size: file.size });
  if (!validation.ok) return Response.json({ error: documentErrorMessage(validation.error) }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = randomUUID();
  const titleValue = form.get("title");
  const title = typeof titleValue === "string" && titleValue.trim() ? titleValue.trim().slice(0, 120) : file.name.slice(0, 120);
  const client = await createServerSupabaseClient();
  const created = await client.rpc("create_review", { p_dept: membership.deptId, p_input: {
    id, kind: "document", title, filename: file.name, size: file.size,
    fingerprint: createHash("sha256").update(bytes).digest("hex"), duration: null,
    visibility: form.get("visibility") === "leads_only" ? "leads_only" : "dept",
    participants: [], synthetic: false, consent_confirmed: true,
  } });
  if (created.error) { const error = reviewError(created.error); return Response.json(error, { status: error.status }); }
  const uploaded = await client.storage.from("review-materials").upload(`${membership.deptId}/${id}/original`, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploaded.error) return Response.json({ error: "원본 보관에 실패했습니다. 자료 검토 목록에서 확인해 주세요.", review_id: id }, { status: 500 });
  const queued = await client.rpc("queue_review_part", { p_review: id, p_index: 0 });
  if (queued.error) { const error = reviewError(queued.error); return Response.json(error, { status: error.status }); }
  kickWorker();
  return Response.json({ ok: true, review_id: id, job_id: queued.data }, { status: 202 });
}
