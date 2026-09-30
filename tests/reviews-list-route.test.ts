import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ membership: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.membership }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.create }));

import { GET } from "@/app/api/d/[dept]/reviews/route";

const deptId = "22222222-2222-4222-8222-222222222222";
const review = { id: "review-1", kind: "audio", title: "회의", original_layout: "audio_segments" };
type QueryResult = { data: unknown; error: unknown };

function queryStub(result: QueryResult) {
  const stub = {
    select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), not: vi.fn(),
    then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  stub.select.mockReturnValue(stub);
  stub.eq.mockReturnValue(stub);
  stub.order.mockReturnValue(stub);
  stub.limit.mockReturnValue(stub);
  stub.not.mockReturnValue(stub);
  return stub;
}

function client(settings: QueryResult) {
  const reviews = queryStub({ data: [review], error: null });
  const members = queryStub({ data: [], error: null });
  return {
    from: vi.fn((table: string) => table === "reviewed_materials" ? reviews : members),
    rpc: vi.fn().mockResolvedValue(settings),
    reviews,
  };
}

const request = () => new Request("https://sasu.example/api/d/department-slug/reviews");
const context = { params: Promise.resolve({ dept: "department-slug" }) };

describe("GET /reviews 조직 녹음 진입 설정", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.membership.mockResolvedValue({ deptId, role: "lead", consentedAt: "2026-09-25" });
  });

  it.each([
    [{ data: { browser_recording_enabled: true }, error: null }, true],
    [{ data: { browser_recording_enabled: false }, error: null }, false],
    [{ data: null, error: null }, false],
    [{ data: null, error: { code: "rpc_failed" } }, false],
  ])("설정 %j일 때 recording_enabled=%s이며 목록은 200이다", async (settings, enabled) => {
    const serverClient = client(settings);
    mocks.create.mockResolvedValue(serverClient);
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      recording_enabled: enabled,
      reviews: [review],
    });
    expect(serverClient.rpc).toHaveBeenCalledWith("review_org_settings", { p_dept: deptId });
    expect(serverClient.reviews.select).toHaveBeenCalledWith(expect.stringContaining("original_layout"));
  });
});
