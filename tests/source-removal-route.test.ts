import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMembership: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/membership", () => ({
  requireMembership: mocks.requireMembership,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ rpc: mocks.rpc }),
}));

import { DELETE } from "@/app/api/d/[dept]/settings/source/route";

const membership = {
  userId: "11111111-1111-4111-8111-111111111111",
  deptId: "22222222-2222-4222-8222-222222222222",
  role: "lead" as const,
  displayName: "합성 팀장",
};
const sourceId = "33333333-3333-4333-8333-333333333333";

describe("소스 제거 경계", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireMembership.mockResolvedValue(membership);
    mocks.rpc.mockResolvedValue({ data: { removed_items: 2 }, error: null });
  });

  it("lead는 세션 클라이언트의 remove_source RPC로만 제거한다", async () => {
    const response = await DELETE(
      new Request(`http://localhost/api/d/dept/settings/source?id=${sourceId}`, { method: "DELETE" }),
      { params: Promise.resolve({ dept: membership.deptId }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, removed_items: 2 });
    expect(mocks.rpc).toHaveBeenCalledWith("remove_source", { p_source: sourceId });
  });

  it("잘못된 소스 ID는 RPC 호출 없이 거부한다", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/d/dept/settings/source?id=not-a-uuid", { method: "DELETE" }),
      { params: Promise.resolve({ dept: membership.deptId }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("member는 제거를 실행할 수 없다", async () => {
    mocks.requireMembership.mockResolvedValue({ ...membership, role: "member" as const });

    const response = await DELETE(
      new Request(`http://localhost/api/d/dept/settings/source?id=${sourceId}`, { method: "DELETE" }),
      { params: Promise.resolve({ dept: membership.deptId }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
