import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dept: string; id: string }> },
) {
  const { dept, id } = await params;
  const member = await requireMembership(dept);
  const client = await createServerSupabaseClient();
  const result = await client
    .from("reviewed_materials")
    .select("original_path,original_deleted_at")
    .eq("id", id)
    .eq("dept_id", member.deptId)
    .maybeSingle();
  if (!result.data?.original_path || result.data.original_deleted_at)
    return Response.json({ error: "보관된 원본이 없습니다." }, { status: 404 });
  const signed = await client.storage
    .from("review-materials")
    .createSignedUrl(result.data.original_path, 60);
  if (signed.error)
    return Response.json(
      { error: "원본을 열지 못했습니다. 업로드가 완료됐는지 확인해 주세요." },
      { status: 422 },
    );
  return Response.json(
    { url: signed.data.signedUrl },
    { headers: { "cache-control": "no-store" } },
  );
}
