import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID.test(id)) {
    return Response.json(
      { error: "기기 정보를 확인할 수 없습니다.", code: "invalid_device" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return Response.json(
      { error: "로그인이 필요합니다.", code: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const { data, error } = await supabase.rpc("revoke_device_link", { p_link: id });
  if (error) {
    return Response.json(
      { error: "기기 연결을 해제하지 못했습니다.", code: "revoke_failed" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (!data) {
    return Response.json(
      { error: "연결한 기기를 찾을 수 없습니다.", code: "not_found" },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
}
