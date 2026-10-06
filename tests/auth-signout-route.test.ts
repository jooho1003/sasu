import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { signOut: mocks.signOut },
  }),
}));

import { GET as signoutGet, POST as signoutPost } from "@/app/auth/signout/route";

function signoutRequest(query = "") {
  return new Request(`http://localhost/auth/signout${query}`, { method: "POST" });
}

// U1 (phase 50, ADR-089): 웹 로그아웃은 현재 브라우저 세션만 끝낸다.
describe("POST /auth/signout (U1)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("현재 세션만 끝내도록 signOut을 scope local로 정확히 1회 부른다", async () => {
    await signoutPost(signoutRequest());
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("next가 없으면 303으로 /login에 보낸다", async () => {
    const response = await signoutPost(signoutRequest());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("내부 경로 next는 유지하고 외부 주소 next는 /login으로 정리한다", async () => {
    let response = await signoutPost(signoutRequest("?next=%2Fdemo"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/demo");

    response = await signoutPost(signoutRequest("?next=//evil.example"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(mocks.signOut).toHaveBeenCalledTimes(2);
    for (const call of mocks.signOut.mock.calls) expect(call).toEqual([{ scope: "local" }]);
  });

  it("GET은 405로 막고 signOut을 부르지 않는다", async () => {
    const response = signoutGet();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
