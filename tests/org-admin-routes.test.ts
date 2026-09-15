import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireMembership: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  membershipResult: { data: null as unknown, error: null as unknown },
}));

vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.requireMembership }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    rpc: mocks.rpc,
    auth: {
      getUser: mocks.getUser,
      signOut: mocks.signOut,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
    from: () => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => mocks.membershipResult),
      };
      return builder;
    },
  }),
}));

import { POST as createDepartment } from "@/app/api/admin/departments/route";
import { POST as inviteFirstLead } from "@/app/api/admin/departments/[deptId]/first-lead-invite/route";
import { POST as demoteAdminMember } from "@/app/api/admin/members/demote/route";
import { GET as listLeadInvites, POST as inviteMember } from "@/app/api/d/[dept]/invites/route";
import { POST as promoteMember } from "@/app/api/d/[dept]/members/[userId]/promote/route";
import { POST as acceptInvite } from "@/app/api/invites/accept/route";
import { GET as authCallback } from "@/app/auth/callback/route";
import { GET as signoutGet, POST as signoutPost } from "@/app/auth/signout/route";

const deptId = "22222222-2222-4222-8222-222222222222";
const userId = "11111111-1111-4111-8111-111111111111";
const inviteId = "33333333-3333-4333-8333-333333333333";
const lead = { userId, deptId, role: "lead" as const, displayName: "팀장", consentedAt: null };
const context = { params: Promise.resolve({ dept: deptId }) };

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, { method: "POST", body: JSON.stringify(body) });
}

describe("조직 관리자 라우트", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
    vi.stubEnv("SASU_ORG_ADMIN_MODE", "on");
    mocks.requireMembership.mockResolvedValue(lead);
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.membershipResult = { data: { dept_id: deptId }, error: null };
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  it("off는 읽기와 쓰기를 404로 닫고 readonly는 목록만 연다", async () => {
    vi.stubEnv("SASU_ORG_ADMIN_MODE", "off");
    expect((await createDepartment(jsonRequest("/api/admin/departments", { name: "제품" }))).status).toBe(404);
    expect((await listLeadInvites(new Request("http://localhost/api/d/x/invites"), context)).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();

    vi.stubEnv("SASU_ORG_ADMIN_MODE", "readonly");
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect((await listLeadInvites(new Request("http://localhost/api/d/x/invites"), context)).status).toBe(200);
    expect((await inviteMember(jsonRequest("/api/d/x/invites", { email: "member@example.com" }), context)).status).toBe(404);
  });

  it("본문의 조직·역할 필드를 버리고 허용 인자만 RPC로 보낸다", async () => {
    mocks.rpc.mockResolvedValue({ data: deptId, error: null });
    const response = await createDepartment(jsonRequest("/api/admin/departments", {
      name: "제품", org_id: "forged", role: "lead", created_by: "forged",
    }));
    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith("admin_create_department", { p_name: "제품" });
  });

  it.each([
    [{ code: "42501", message: "forbidden" }, 403, "forbidden"],
    [{ code: "42501", message: "self_invite_forbidden" }, 403, "self_invite_forbidden"],
    [{ code: "22023", message: "invalid_department_name" }, 400, "invalid_department_name"],
    [{ code: "P0001", message: "department_name_taken" }, 409, "department_name_taken"],
  ])("RPC 오류를 공개 상태와 한국어 문장으로 매핑한다", async (error, status, code) => {
    mocks.rpc.mockResolvedValue({ data: null, error });
    const response = await createDepartment(jsonRequest("/api/admin/departments", { name: "제품" }));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: code, message: expect.any(String) });
  });

  it("초대 생성은 토큰을 URL 한 곳에만 넣고 캐시하지 않는다", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ invite_id: inviteId, token: "secret-token", expires_at: "2026-09-22T00:00:00Z" }], error: null });
    const response = await inviteFirstLead(
      jsonRequest(`/api/admin/departments/${deptId}/first-lead-invite`, { email: "LEAD@example.com", org_id: "forged", role: "member" }),
      { params: Promise.resolve({ deptId }) },
    );
    const text = await response.text();
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(text.match(/secret-token/g)).toHaveLength(1);
    expect(mocks.rpc).toHaveBeenCalledWith("admin_invite_first_lead", { p_dept: deptId, p_email: "lead@example.com" });
  });

  it("일반 멤버는 부서장 명령을 호출할 수 없다", async () => {
    mocks.requireMembership.mockResolvedValue({ ...lead, role: "member" });
    const response = await promoteMember(new Request("http://localhost"), {
      params: Promise.resolve({ dept: deptId, userId }),
    });
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("수락 라우트는 민감 입력을 로그에 남기지 않는다", async () => {
    mocks.rpc.mockResolvedValue({ data: deptId, error: null });
    const spies = [vi.spyOn(console, "log").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {})];
    const response = await acceptInvite(jsonRequest("/api/invites/accept", { token: "secret-token", displayName: "민감 이름" }));
    expect(response.status).toBe(200);
    expect(spies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect(await response.json()).toEqual({ deptId, next: `/consent?next=${encodeURIComponent(`/d/${deptId}`)}` });
  });

  it("관리자 멤버 명령은 camelCase 대상만 전달한다", async () => {
    const response = await demoteAdminMember(jsonRequest("/api/admin/members/demote", {
      userId, deptId, org_id: "forged", role: "lead",
    }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("demote_lead", { p_user: userId, p_dept: deptId });
  });

  it("콜백은 안전한 쿠키 next를 우선하고 사용 후 지운다", async () => {
    const request = new NextRequest("http://localhost/auth/callback?code=ok", {
      headers: { cookie: "sasu_login_next=%2Fadmin%2Fevents" },
    });
    const response = await authCallback(request);
    expect(response.headers.get("location")).toBe("http://localhost/admin/events");
    expect(response.cookies.get("sasu_login_next")?.value).toBe("");
  });

  it("멤버십 없는 관리자는 admin으로, off면 관리자 RPC 없이 no-membership으로 간다", async () => {
    mocks.membershipResult = { data: null, error: null };
    mocks.rpc.mockResolvedValue({ data: "org-id", error: null });
    let response = await authCallback(new NextRequest("http://localhost/auth/callback?code=ok"));
    expect(response.headers.get("location")).toBe("http://localhost/admin");

    vi.stubEnv("SASU_ORG_ADMIN_MODE", "off");
    mocks.rpc.mockClear();
    response = await authCallback(new NextRequest("http://localhost/auth/callback?code=ok"));
    expect(response.headers.get("location")).toBe("http://localhost/no-membership");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("로그아웃은 POST만 허용하고 303으로 이동한다", async () => {
    expect(signoutGet().status).toBe(405);
    const response = await signoutPost(new Request("http://localhost/auth/signout?next=//evil.example", { method: "POST" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
