import { createHash, randomUUID } from "node:crypto";

import { validateDocumentUpload } from "@/lib/adapters/document";
import { reviewError } from "@/lib/reviews";
import { kickWorker } from "@/lib/jobs";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function documentErrorMessage(error: string): string {
  if (error === "unsupported_document_format") return "TXT, MD, CSV, JSON, PDF, DOCX 파일만 업로드할 수 있습니다.";
  if (error === "document_too_large") return "문서는 20MB 이하이어야 합니다.";
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

  return Response.json({
    documents: (result.data ?? []).map((row) => {
      const source = relationValue(row.sources as { title: string | null; visibility: "dept" | "leads_only" } | Array<{ title: string | null; visibility: "dept" | "leads_only" }>);
      return {
        id: row.source_id,
        title: source.title,
        visibility: source.visibility,
        status: row.status,
        status_reason: row.status_reason,
        summary: row.summary,
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
