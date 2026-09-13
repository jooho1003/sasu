import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  buildDecisionModal: vi.fn(),
  openModal: vi.fn(),
  postMessage: vi.fn(),
  rpc: vi.fn(),
  updateMessage: vi.fn(),
  verifySlackSignature: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/slack/verify", () => ({
  verifySlackSignature: mocks.verifySlackSignature,
}));
vi.mock("@/lib/slack/blocks", () => ({
  buildDecisionModal: mocks.buildDecisionModal,
}));
vi.mock("@/lib/slack/post", () => ({
  openModal: mocks.openModal,
  postMessage: mocks.postMessage,
  updateMessage: mocks.updateMessage,
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => ({
    from: vi.fn(),
    rpc: mocks.rpc,
  }),
}));

import { POST } from "@/app/api/slack/interactions/route";

const DEPT_ID = "22222222-2222-4222-8222-222222222222";

function consentRequest(slackUserId = "U_CLICKER") {
  const payload = {
    type: "block_actions",
    user: { id: slackUserId },
    actions: [
      {
        action_id: "sasu_consent",
        value: DEPT_ID,
        user_id: "U_SOMEONE_ELSE",
      },
    ],
    container: { channel_id: "D_CONSENT", message_ts: "1.23" },
  };
  return new Request("http://localhost/api/slack/interactions", {
    method: "POST",
    body: new URLSearchParams({ payload: JSON.stringify(payload) }).toString(),
    headers: {
      "x-slack-request-timestamp": "1",
      "x-slack-signature": "v0=synthetic",
    },
  });
}

describe("Slack 본인 동의 인터랙션", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("SLACK_SIGNING_SECRET", "synthetic-secret");
    mocks.verifySlackSignature.mockReturnValue(true);
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.updateMessage.mockResolvedValue(undefined);
    mocks.after.mockImplementation((callback: () => unknown) => callback());
  });

  it("클릭한 Slack 사용자와 버튼의 부서만 RPC에 전달하고 DM을 교체한다", async () => {
    const response = await POST(consentRequest());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("consent_via_slack", {
      p_slack_user: "U_CLICKER",
      p_dept: DEPT_ID,
    });
    expect(mocks.updateMessage).toHaveBeenCalledWith({
      channel: "D_CONSENT",
      ts: "1.23",
      text: "동의가 기록되었습니다. 이제부터 연결된 채널의 내 발언이 사수에 저장됩니다.",
      blocks: expect.any(Array),
    });
  });

  it("매핑된 멤버십이 없으면 계정 연결 안내로 DM을 교체한다", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    expect((await POST(consentRequest("U_UNMAPPED"))).status).toBe(200);
    expect(mocks.updateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("계정 연결"),
      }),
    );
  });

  it("서명 실패는 DB 호출 전에 401로 거부한다", async () => {
    mocks.verifySlackSignature.mockReturnValue(false);

    expect((await POST(consentRequest())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.updateMessage).not.toHaveBeenCalled();
  });
});
