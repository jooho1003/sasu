import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/public", () => ({
  createPublicSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

import { POST as consent } from "@/app/api/t/i/consent/route";
import { POST as open } from "@/app/api/t/i/open/route";

const token = "a".repeat(64);
const email = "candidate@example.com";
const scenario = {
  id: "scenario",
  title: "협력사 변경",
  summary: "운영 기준을 검토하세요.",
  facts: [{ id: "fact", place: "library", label: "운영 원칙", text: "변경 전 영향 범위를 확인한다." }],
  dialogues: [{ id: "dialogue", place: "finance", question: "무엇을 확인하나요?", fact_id: "fact", quote: "영향 범위를 확인한다." }],
  choices: [{ id: "keep", label: "유지" }, { id: "change", label: "변경" }],
  ending: { choice_id: "change", fact_id: "fact", quote: "변경 전 영향 범위를 확인한다." },
};
const opened = {
  scenarios: [scenario],
  apply_url: "https://jobs.example.com/posting",
  org_display_name: "온새미로 주식회사",
  state: "consent_required",
  consent_version: "1",
  expires_at: "2026-09-25T00:00:00.000Z",
};

function request(body: unknown) {
  return new Request("http://localhost/api/t/i/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("지원자 예고편 공개 열람 라우트", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("SASU_TRAILER_PUBLISH_ENABLED", "true");
    vi.stubEnv("SASU_TRAILER_INVITES_ENABLED", "true");
    mocks.rpc.mockResolvedValue({ data: opened, error: null });
  });

  it("플래그 off면 anon RPC 전에 404", async () => {
    vi.stubEnv("SASU_TRAILER_INVITES_ENABLED", "false");
    const response = await open(request({ token, email }));
    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("토큰 형식 위반과 미존재를 같은 코드로 숨긴다", async () => {
    const malformed = await open(request({ token: "not-a-token", email }));
    expect(malformed.status).toBe(404);
    expect(await malformed.json()).toEqual({ error: "invite_unavailable" });
    expect(malformed.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.rpc.mockResolvedValueOnce({ data: { error: "invite_unavailable" }, error: null });
    const missing = await open(request({ token, email }));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "invite_unavailable" });
  });

  it("RPC 응답에 내부 식별자가 섞이면 fail-closed 처리한다", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...opened, dept_id: "secret-dept" }, error: null });
    const response = await open(request({ token, email }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "invite_unavailable" });
  });

  it("검증된 응답만 no-store로 반환하고 토큰·이메일을 로그에 남기지 않는다", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await open(request({ token, email }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual(opened);
    expect(mocks.rpc).toHaveBeenCalledWith("trailer_invite_open", { p_token: token, p_email: email });
    const logged = JSON.stringify([...errorSpy.mock.calls, ...warnSpy.mock.calls]);
    expect(logged).not.toContain(token);
    expect(logged).not.toContain(email);
  });

  it("동의도 anon RPC만 호출하고 no-store 응답을 쓴다", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({data:{...opened,state:"ready"},error:null});
    const response = await consent(request({ token, email, consent_version: "1" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ state: "ready" });
    expect(mocks.rpc).toHaveBeenCalledWith("trailer_invite_consent", {
      p_token: token,
      p_email: email,
      p_version: "1",
    });
  });
  it("동의 RPC가 빈 성공을 반환해도 실제 동의가 없으면 다음 단계로 보내지 않는다", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect((await consent(request({token,email,consent_version:"1"}))).status).toBe(404);
  });
});
