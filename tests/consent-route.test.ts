import { encryptSlackToken } from "@/lib/slack/installation";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consentBlocks: vi.fn(() => [{ type: "section" }]),
  createClient: vi.fn(),
  workspace: vi.fn(),
  openDirectMessage: vi.fn(),
  postMessage: vi.fn(),
  requireMembership: vi.fn(),
}));

vi.mock("@/lib/supabase/membership", () => ({
  requireMembership: mocks.requireMembership,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ ...(await mocks.createClient()), rpc: mocks.workspace }),
}));
vi.mock("@/lib/slack/blocks", () => ({ consentBlocks: mocks.consentBlocks }));
vi.mock("@/lib/slack/post", () => ({
  openDirectMessage: mocks.openDirectMessage,
  postMessage: mocks.postMessage,
}));

import { CONSENT_VERSION } from "@/lib/consent";
import { POST } from "@/app/api/d/[dept]/settings/consent/route";

const DEPT_ID = "22222222-2222-4222-8222-222222222222";

function query(data: unknown, error: unknown = null) {
  const builder = {
    select: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data, error })),
    then: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data, error }).then(resolve, reject),
  };
  return builder;
}

function request(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/d/${DEPT_ID}/settings/consent`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("웹 동의와 lead 동의 요청", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Each test names its own URL env; links come only from metadataBase() (invariant 51).
    vi.unstubAllEnvs();
    vi.stubEnv("SLACK_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32,17).toString("base64"));
    mocks.workspace.mockResolvedValue({ data: { org_id: "org", team_id: "TTEST", encrypted_token: encryptSlackToken("xoxb-test", "org", "TTEST") }, error: null });
    mocks.requireMembership.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      deptId: DEPT_ID,
      role: "lead",
      displayName: "합성 팀장",
    });
    mocks.openDirectMessage.mockImplementation(async (userId: string) => ({
      id: `D_${userId}`,
    }));
    mocks.postMessage.mockResolvedValue({ channel: "D_SENT", ts: "1" });
  });

  it("본인 웹 동의는 문서 상수의 consent_version을 저장한다", async () => {
    const builder = query({
      user_id: "11111111-1111-4111-8111-111111111111",
      consented_at: "2026-09-13T00:00:00.000Z",
    });
    mocks.createClient.mockResolvedValue({ from: vi.fn(() => builder) });

    expect((await POST(request({ consented: true }), {
      params: Promise.resolve({ dept: DEPT_ID }),
    })).status).toBe(200);
    expect(builder.update).toHaveBeenCalledWith({
      consented_at: expect.any(String),
      consent_version: CONSENT_VERSION,
    });
  });

  it("lead는 미동의·Slack 연결 멤버에게만 DM을 보내고 건수를 반환한다", async () => {
    const builder = query([
      { slack_user_id: "U_ONE", consented_at: null },
      { slack_user_id: null, consented_at: null },
      { slack_user_id: "U_DONE", consented_at: "2026-09-13T00:00:00.000Z" },
    ]);
    mocks.createClient.mockResolvedValue({ from: vi.fn(() => builder) });

    const response = await POST(request({ action: "request" }), {
      params: Promise.resolve({ dept: DEPT_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ sent: 1, unlinked: 1 });
    expect(body.message).toBe("1명에게 보냈습니다 · 계정 미연결 1명");
    expect(mocks.openDirectMessage).toHaveBeenCalledTimes(1);
    expect(mocks.openDirectMessage).toHaveBeenCalledWith("U_ONE");
    expect(mocks.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "D_U_ONE", blocks: [{ type: "section" }] }),
    );
  });

  async function sendRequestAndGetConsentUrl(): Promise<string> {
    const builder = query([{ slack_user_id: "U_ONE", consented_at: null }]);
    mocks.createClient.mockResolvedValue({ from: vi.fn(() => builder) });
    await POST(request({ action: "request" }), { params: Promise.resolve({ dept: DEPT_ID }) });
    return (mocks.consentBlocks.mock.calls[0] as unknown as [{ consentUrl: string }])[0].consentUrl;
  }

  it("동의 DM 링크는 NEXT_PUBLIC_APP_URL을 쓰고 VERCEL_URL·APP_URL은 무시한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://getsasu.com");
    vi.stubEnv("VERCEL_URL", "preview-x.vercel.app");
    vi.stubEnv("APP_URL", "https://wrong.example");
    expect((await sendRequestAndGetConsentUrl()).startsWith("https://getsasu.com/consent?next=")).toBe(true);
  });

  it("NEXT_PUBLIC_APP_URL이 없으면 VERCEL_PROJECT_PRODUCTION_URL을 쓴다", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "getsasu.com");
    expect((await sendRequestAndGetConsentUrl()).startsWith("https://getsasu.com/consent?next=")).toBe(true);
  });

  it("팀원은 다른 멤버에게 동의 요청 DM을 보낼 수 없다", async () => {
    mocks.requireMembership.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      deptId: DEPT_ID,
      role: "member",
      displayName: "합성 팀원",
    });
    mocks.createClient.mockResolvedValue({ from: vi.fn() });

    const response = await POST(request({ action: "request" }), {
      params: Promise.resolve({ dept: DEPT_ID }),
    });

    expect(response.status).toBe(403);
    expect(mocks.openDirectMessage).not.toHaveBeenCalled();
  });
});
