import { ReviewCreate } from "@/lib/contracts";
import { supportedDocumentExtension } from "@/lib/adapters/document";
import { reviewError } from "@/lib/reviews";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const member = await requireMembership(dept);
  const client = await createServerSupabaseClient();
  const result = await client
    .from("reviewed_materials")
    .select(
      "id,kind,title,filename,status,status_reason,visibility,revision,published_revision,published_source_id,duration,created_at,updated_at,original_deleted_at",
    )
    .eq("dept_id", member.deptId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (result.error)
    return Response.json(reviewError(result.error), { status: 500 });
  const members = await client
    .from("members")
    .select("user_id,display_name,consented_at")
    .eq("dept_id", member.deptId)
    .not("consented_at", "is", null);
  return Response.json(
    { reviews: result.data, members: members.data ?? [], role: member.role },
    { headers: { "cache-control": "no-store" } },
  );
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const member = await requireMembership(dept);
  const body = ReviewCreate.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json(
      { error: "파일 정보·동의·지원 한도를 확인해 주세요." },
      { status: 400 },
    );
  if (
    body.data.kind === "document" &&
    (!supportedDocumentExtension(body.data.filename) ||
      body.data.size > 20 * 1024 * 1024)
  )
    return Response.json(
      { error: "20MB 이하 TXT, MD, CSV, JSON, PDF, DOCX를 선택해 주세요." },
      { status: 400 },
    );
  const client = await createServerSupabaseClient();
  const result = await client.rpc("create_review", {
    p_dept: member.deptId,
    p_input: body.data,
  });
  if (result.error) {
    const error = reviewError(result.error);
    return Response.json(error, { status: error.status });
  }
  return Response.json({ id: result.data }, { status: 201 });
}
