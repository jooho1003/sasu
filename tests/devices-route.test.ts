import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));

import { DELETE } from "@/app/api/devices/[id]/route";
import { GET } from "@/app/api/devices/route";

const deviceId = "11111111-1111-4111-8111-111111111111";

function activeDevices(data: unknown) {
  const is = vi.fn().mockResolvedValue({ data, error: null });
  const select = vi.fn().mockReturnValue({ is });
  mocks.from.mockReturnValue({ select });
  return { select, is };
}

describe("연결한 기기 API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "me" } }, error: null });
  });

  it("쿠키 세션의 활성 기기와 부서 이름만 반환한다", async () => {
    const { select, is } = activeDevices([
      {
        id: deviceId,
        device_name: "업무용 노트북",
        created_at: "2026-10-01T00:00:00Z",
        last_seen_at: "2026-10-01T01:00:00Z",
        departments: { name: "영업팀" },
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      devices: [{
        id: deviceId,
        device_name: "업무용 노트북",
        dept_name: "영업팀",
        created_at: "2026-10-01T00:00:00Z",
        last_seen_at: "2026-10-01T01:00:00Z",
      }],
    });
    expect(select).toHaveBeenCalledWith("id, device_name, created_at, last_seen_at, departments(name)");
    expect(is).toHaveBeenCalledWith("revoked_at", null);
  });

  it("로그인하지 않으면 JSON 401을 돌려준다", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "로그인이 필요합니다.", code: "unauthorized" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("본인 기기는 해제 RPC로만 해제한다", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    const response = await DELETE(new Request(`http://localhost/api/devices/${deviceId}`, { method: "DELETE" }), {
      params: Promise.resolve({ id: deviceId }),
    });

    expect(response.status).toBe(204);
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_device_link", { p_link: deviceId });
  });

  it("잘못된 ID와 찾을 수 없는 연결을 구분한다", async () => {
    const invalid = await DELETE(new Request("http://localhost/api/devices/no", { method: "DELETE" }), {
      params: Promise.resolve({ id: "no" }),
    });
    expect(invalid.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const missing = await DELETE(new Request(`http://localhost/api/devices/${deviceId}`, { method: "DELETE" }), {
      params: Promise.resolve({ id: deviceId }),
    });
    expect(missing.status).toBe(404);
  });
});
