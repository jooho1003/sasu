import { afterEach, describe, expect, it, vi } from "vitest";

import { openDirectMessage, postMessage } from "@/lib/slack/post";

describe("Slack API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SLACK_BOT_TOKEN;
  });

  it("토큰이 없으면 외부 호출 전에 설정 오류를 반환한다", async () => {
    await expect(openDirectMessage("U123")).rejects.toMatchObject({
      error_code: "slack_not_configured",
    });
    expect(vi.restoreAllMocks).toBeDefined();
  });

  it("DM을 열고 메시지를 게시한다", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, channel: { id: "D123" } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, channel: "D123", ts: "1.2" }), {
          status: 200,
        }),
      );

    await expect(openDirectMessage("U123")).resolves.toEqual({ id: "D123" });
    await expect(
      postMessage({ channel: "D123", text: "결정 카드", blocks: [] }),
    ).resolves.toEqual({ channel: "D123", ts: "1.2" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("conversations.open");
    expect(fetchMock.mock.calls[1][0]).toContain("chat.postMessage");
  });
});
