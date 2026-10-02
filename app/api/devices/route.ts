import { createServerSupabaseClient } from "@/lib/supabase/server";

type DeviceRow = {
  id: string;
  device_name: string;
  created_at: string;
  last_seen_at: string;
  departments: { name: string } | { name: string }[] | null;
};

export async function GET() {
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

  const { data, error } = await supabase
    .from("device_links")
    .select("id, device_name, created_at, last_seen_at, departments(name)")
    .is("revoked_at", null);

  if (error) {
    return Response.json(
      { error: "연결한 기기를 불러오지 못했습니다.", code: "devices_unavailable" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const devices = ((data ?? []) as DeviceRow[]).map((device) => {
    const department = Array.isArray(device.departments)
      ? device.departments[0]
      : device.departments;
    return {
      id: device.id,
      device_name: device.device_name,
      dept_name: department?.name ?? "이름 없는 부서",
      created_at: device.created_at,
      last_seen_at: device.last_seen_at,
    };
  });

  return Response.json(
    { devices },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
