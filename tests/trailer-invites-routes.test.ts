import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  membership: vi.fn(),
  rpc: vi.fn(),
  eq: vi.fn(),
  missingChild: false,
  target: { data: { id: "33333333-3333-4333-8333-333333333333" } as unknown, error: null as unknown },
  runWorkerOnce: vi.fn(),
  after: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/worker", () => ({ runWorkerOnce: mocks.runWorkerOnce }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.membership }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      const query = { select: () => query, eq: (...args: unknown[]) => { mocks.eq(table, ...args); return query; }, maybeSingle: async () => mocks.missingChild && table !== "trailers" ? { data: null, error: null } : mocks.target };
      return query;
    },
  }),
}));

import { GET, POST } from "@/app/api/d/[dept]/trailers/[id]/invites/route";
import { DELETE } from "@/app/api/d/[dept]/trailers/[id]/invites/[inviteId]/route";
import { POST as revoke } from "@/app/api/d/[dept]/trailers/[id]/invites/[inviteId]/revoke/route";
import { POST as rescore } from "@/app/api/d/[dept]/trailers/[id]/invites/attempts/[attemptId]/rescore/route";

const dept = "22222222-2222-4222-8222-222222222222";
const trailer = "33333333-3333-4333-8333-333333333333";
const invite = "44444444-4444-4444-8444-444444444444";
const attempt = "55555555-5555-4555-8555-555555555555";
const context = { params: Promise.resolve({ dept, id: trailer, inviteId: invite, attemptId: attempt }) };
const request = (method = "GET", body?: unknown) => new Request("http://localhost", { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "Content-Type": "application/json" } });

describe("예고편 지원자 링크 라우트", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.unstubAllEnvs();
    vi.stubEnv("SASU_TRAILER_PUBLISH_ENABLED", "true"); vi.stubEnv("SASU_TRAILER_INVITES_ENABLED", "true");
    mocks.membership.mockResolvedValue({ deptId: dept, role: "lead" });
    mocks.missingChild = false; mocks.target.data = { id: trailer }; mocks.target.error = null;
    mocks.rpc.mockResolvedValue({ data: [], error: null });
  });

  it("초대 플래그 off면 인증과 RPC 전에 404", async () => {
    vi.stubEnv("SASU_TRAILER_INVITES_ENABLED", "false");
    expect((await GET(request(), context)).status).toBe(404);
    expect(mocks.membership).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("세션 없음은 401, 일반 멤버와 다른 부서는 RPC에 도달하지 않는다", async () => {
    mocks.membership.mockRejectedValueOnce(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" }));
    expect((await GET(request(), context)).status).toBe(401);
    mocks.membership.mockResolvedValue({ deptId: dept, role: "member" });
    expect((await GET(request(), context)).status).toBe(403);
    mocks.membership.mockResolvedValue({ deptId: dept, role: "lead" }); mocks.target.data = null;
    expect((await GET(request(), context)).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("발급은 세션 부서와 RPC 계약만 쓰며 토큰 응답에 no-store를 붙인다", async () => {
    const issued = [{ invite_id: invite, email: "candidate@example.com", token: "a".repeat(64), expires_at: "2026-09-25T00:00:00.000Z", skipped_reason: null }];
    mocks.rpc.mockResolvedValue({ data: issued, error: null });
    const response = await POST(request("POST", { emails: ["candidate@example.com"] }), context);
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ invites: issued });
    expect(mocks.rpc).toHaveBeenCalledWith("create_trailer_invites", { p_trailer: trailer, p_emails: ["candidate@example.com"] });
  });

  it("21개 이메일은 RPC 전에 400으로 거부한다", async () => {
    const emails = Array.from({ length: 21 }, (_, index) => `candidate${index}@example.com`);
    expect((await POST(request("POST", { emails }), context)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("목록은 토큰을 반환하지 않고 철회·삭제는 204", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ invite_id: invite, email: "candidate@example.com", status: "pending", expires_at: "2026-09-25T00:00:00.000Z", first_opened_at: null, consented_at: null, submitted_at: null, attempt_id: null, attempt_status: null, weighted_score: null }], error: null });
    const response = await GET(request(), context); const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("token"); expect(mocks.rpc).toHaveBeenCalledWith("list_trailer_invites", { p_trailer: trailer });
    expect((await revoke(request("POST"), context)).status).toBe(204);
    expect((await DELETE(request("DELETE"), context)).status).toBe(204);
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_trailer_invite", { p_invite: invite });
    expect(mocks.rpc).toHaveBeenCalledWith("delete_trailer_invite", { p_invite: invite });
  });

  it("다른 예고편 소속 초대와 제출은 변경하지 않는다", async () => {
    mocks.missingChild = true;
    expect((await revoke(request("POST"), context)).status).toBe(404);
    expect((await DELETE(request("DELETE"), context)).status).toBe(404);
    expect((await rescore(request("POST"), context)).status).toBe(404);
    expect(mocks.eq).toHaveBeenCalledWith("trailer_invites", "trailer_id", trailer);
    expect(mocks.eq).toHaveBeenCalledWith("trailer_attempts", "trailer_id", trailer);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("재채점 RPC 뒤 after에서 워커를 한 번 실행한다", async () => {
    mocks.after.mockImplementation((callback: () => Promise<unknown>) => { void callback(); });
    expect((await rescore(request("POST"), context)).status).toBe(202);
    expect(mocks.rpc).toHaveBeenCalledWith("requeue_trailer_attempt_score", { p_attempt: attempt });
    expect(mocks.after).toHaveBeenCalledOnce(); expect(mocks.runWorkerOnce).toHaveBeenCalledOnce();
  });
});
