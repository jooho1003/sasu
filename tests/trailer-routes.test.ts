import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), membership: vi.fn(), enqueue: vi.fn(), kick: vi.fn(), target: { data: { id: "target" } as unknown, error: null } }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.membership }));
vi.mock("@/lib/jobs", () => ({ enqueue: mocks.enqueue, kickWorker: mocks.kick }));
vi.mock("@/lib/pipeline/trailer-generate", () => ({ registerTrailerGenerateHandler: vi.fn() }));
vi.mock("@/lib/pipeline/trailer-gate", () => ({ registerTrailerGateHandler: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc, from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => mocks.target }; return q; } }) }));
import { createTrailer, trailerAction } from "@/app/api/d/[dept]/trailers/_shared";
import { POST as toggle } from "@/app/api/admin/trailer-publishing/route";
import { DEFAULT_TRAILER_RUBRIC } from "@/lib/trailer-generation";
import fixture from "./fixtures/trailer-approval.json";
const dept = "22222222-2222-4222-8222-222222222222", id = "33333333-3333-4333-8333-333333333333", decision = "44444444-4444-4444-8444-444444444444";
const context = { params: Promise.resolve({ dept, id }) };
const request = (body: unknown = {}) => new Request("http://localhost", { method: "POST", body: JSON.stringify(body) });
describe("예고편 요청 경계", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); vi.stubEnv("SASU_TRAILER_PUBLISH_ENABLED", "true"); vi.stubEnv("SASU_ORG_ADMIN_MODE", "on"); mocks.membership.mockResolvedValue({ deptId: dept, role: "lead" }); mocks.target.data = { id }; mocks.rpc.mockResolvedValue({ data: { trailer_id: id, updated_at: "2026-09-15T01:00:00Z" }, error: null }); });
  it("발행 플래그 off는 인증과 RPC 전 404", async () => {
    vi.stubEnv("SASU_TRAILER_PUBLISH_ENABLED", "false");
    expect((await createTrailer(request(), context)).status).toBe(404);
    for (const action of ["update", "delete", "regenerate", "recheck", "approve", "publish", "unpublish"] as const) expect((await trailerAction(request(), context, action)).status).toBe(404);
    expect((await toggle(request({ enabled: true }))).status).toBe(404);
    expect(mocks.membership).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("일반 멤버와 다른 부서 대상은 RPC에 도달하지 않음", async () => {
    mocks.membership.mockResolvedValue({ deptId: dept, role: "member" });
    expect((await createTrailer(request(), context)).status).toBe(403);
    mocks.membership.mockResolvedValue({ deptId: dept, role: "lead" }); mocks.target.data = null;
    expect((await trailerAction(request(), context, "publish")).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("서버 부서·기준표만 쓰고 생성 버전으로 job 중복을 막음", async () => {
    expect((await createTrailer(request({ decisionIds: [decision], bannedTerms: [" ", " 예시 "], dept_id: "forged", created_by: "forged", rubric: [] }), context)).status).toBe(202);
    expect(mocks.rpc).toHaveBeenCalledWith("create_trailer_draft", { p_dept: dept, p_decision_ids: [decision], p_banned_terms: ["예시"], p_apply_url: null, p_rubric: DEFAULT_TRAILER_RUBRIC });
    expect(mocks.enqueue).toHaveBeenCalledWith("generate_trailer", { trailerId: id }, { dedupeKey: `${id}:2026-09-15T01:00:00Z` }); expect(mocks.kick).toHaveBeenCalledOnce();
  });
  it("잘못된 시나리오 422는 필드 경로만 반환", async () => {
    const response = await trailerAction(request({ scenarios: [{ secret: "원문 비밀" }] }), context, "update");
    expect(response.status).toBe(422); const body = await response.text(); expect(body).toContain("scenarios[0]"); expect(body).not.toContain("원문 비밀"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("수정은 본 버전을 전달하고 검사 job을 만듦", async () => {
    expect((await trailerAction(request({ scenarios: fixture.scenarios, seenUpdatedAt: "2026-09-15T00:00:00Z" }), context, "update")).status).toBe(202);
    expect(mocks.rpc).toHaveBeenCalledWith("update_trailer_scenarios", { p_trailer: id, p_scenarios: fixture.scenarios, p_seen_updated_at: "2026-09-15T00:00:00Z" });
    expect(mocks.enqueue).toHaveBeenCalledWith("check_trailer_gate", expect.anything(), expect.anything());
  });
  it.each([["trailer_daily_limit", 429], ["trailer_stale", 409], ["trailer_publishing_disabled", 409], ["trailer_gate_not_passed", 409], ["trailer_not_approved", 409]])("%s 오류는 %s", async (message, status) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message } }); expect((await trailerAction(request(), context, "publish")).status).toBe(status); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("http 주소는 RPC 전에 거부", async () => { expect((await createTrailer(request({ decisionIds: [decision], bannedTerms: [], applyUrl: "http://example.com" }), context)).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it("반복 발행 응답에 같은 공개 경로", async () => {
    const slug = "abcdefghijklmnopqrstuv"; mocks.rpc.mockResolvedValue({ data: slug, error: null });
    for (let i = 0; i < 2; i++) expect(await (await trailerAction(request(), context, "publish")).json()).toEqual({ slug, publicPath: `/t/${slug}` });
  });
  it("관리자 readonly는 토글을 닫음", async () => { vi.stubEnv("SASU_ORG_ADMIN_MODE", "readonly"); expect((await toggle(request({ enabled: true }))).status).toBe(404); expect(mocks.rpc).not.toHaveBeenCalled(); });
});
