import { randomUUID } from "node:crypto";

import { extractDocumentText, chunkDocumentText, validateDocumentUpload } from "@/lib/adapters/document";
import { enqueue, kickWorker } from "@/lib/jobs";
import { mask } from "@/lib/mask";
import { registerClassifyHandler } from "@/lib/pipeline/classify";
import { registerDocumentSummaryHandler } from "@/lib/pipeline/document-summary";
import { registerEmbedHandler } from "@/lib/pipeline/embed";
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
    .eq("dept_id", membership.deptId)
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  if (membership.role !== "lead") {
    return Response.json({ error: "문서 업로드는 팀장만 할 수 있습니다." }, { status: 403 });
  }

  const form = await request.formData();
  const fileValue = form.get("file");
  if (!(fileValue instanceof File)) {
    return Response.json({ error: "문서 파일을 선택해주세요." }, { status: 400 });
  }

  const validation = validateDocumentUpload({
    filename: fileValue.name,
    mimeType: fileValue.type,
    size: fileValue.size,
  });
  if (!validation.ok) return Response.json({ error: documentErrorMessage(validation.error) }, { status: 400 });

  let chunks: string[];
  try {
    const text = await extractDocumentText(fileValue.name, new Uint8Array(await fileValue.arrayBuffer()));
    chunks = chunkDocumentText(text);
  } catch {
    return Response.json({ error: "문서에서 텍스트를 추출하지 못했습니다." }, { status: 400 });
  }
  if (chunks.length === 0) return Response.json({ error: "문서에서 읽을 수 있는 텍스트를 찾지 못했습니다." }, { status: 400 });

  const titleValue = form.get("title");
  const title = typeof titleValue === "string" && titleValue.trim() ? titleValue.trim().slice(0, 120) : fileValue.name.slice(0, 120);
  const visibility = form.get("visibility") === "leads_only" ? "leads_only" : "dept";
  const sourceId = randomUUID();
  const supabase = await createServerSupabaseClient();

  const sourceResult = await supabase
    .from("sources")
    .insert({
      id: sourceId,
      dept_id: membership.deptId,
      kind: "document",
      external_id: `upload:${sourceId}`,
      title,
      visibility,
      active: true,
    })
    .select("id")
    .single<{ id: string }>();
  if (sourceResult.error || !sourceResult.data) return Response.json({ error: "문서 소스를 저장하지 못했습니다." }, { status: 500 });

  const summaryResult = await supabase
    .from("document_summaries")
    .insert({
      source_id: sourceId,
      dept_id: membership.deptId,
      status: "processing",
      summary: null,
      extracted_chars: chunks.join("\n").length,
      chunk_count: chunks.length,
    })
    .select("source_id")
    .single<{ source_id: string }>();
  if (summaryResult.error || !summaryResult.data) return Response.json({ error: "문서 처리 상태를 저장하지 못했습니다." }, { status: 500 });

  const itemResult = await supabase
    .from("items")
    .insert(chunks.map((chunk, index) => ({
      source_id: sourceId,
      dept_id: membership.deptId,
      external_ref: `document-chunk-${index + 1}`,
      author_ext_id: null,
      author: "문서",
      spoken_at: null,
      content: mask(chunk),
    })))
    .select("id");
  if (itemResult.error) return Response.json({ error: "문서 내용을 저장하지 못했습니다." }, { status: 500 });

  registerClassifyHandler();
  registerEmbedHandler();
  registerDocumentSummaryHandler();
  for (const item of itemResult.data ?? []) {
    await enqueue("classify", { itemId: item.id }, { dedupeKey: item.id });
  }
  const summaryJobId = await enqueue("summarize_document", { documentId: sourceId }, { dedupeKey: sourceId });
  kickWorker();

  return Response.json({ ok: true, document_id: sourceId, job_id: summaryJobId, chunks: chunks.length }, { status: 202 });
}
