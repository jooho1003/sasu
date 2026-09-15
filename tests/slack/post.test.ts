import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getMessagePermalink,
  openDirectMessage,
  postMessage,
} from "@/lib/slack/post";

describe("Slack API client", () => {
  it("긴 Retry-After는 함수 안에서 대기하지 않고 워커에 전달한다", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    const fetchMock=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({ok:false,error:"ratelimited"}),{status:429,headers:{"retry-after":"120"}}));
    await expect(postMessage({channel:"D123",text:"안내",blocks:[]})).rejects.toMatchObject({error_code:"slack_rate_limited",retryAfterSeconds:120});
    expect(fetchMock).toHaveBeenCalledOnce();
  });
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

  it("답변의 자동 마크업·미리보기 차단 옵션을 Slack으로 전달한다", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, channel: "C123", ts: "1.2" })),
      );
    await postMessage({
      channel: "C123",
      thread_ts: "1.1",
      text: "<!channel>",
      blocks: [],
      mrkdwn: false,
      parse: "none",
      unfurl_links: false,
      unfurl_media: false,
    });
    expect(
      JSON.parse(fetchMock.mock.calls[0][1]?.body as string),
    ).toMatchObject({
      mrkdwn: false,
      parse: "none",
      unfurl_links: false,
      unfurl_media: false,
      thread_ts: "1.1",
    });
  });

  it("인증 헤더와 제한 시간으로 실제 원문 permalink를 조회한다", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    const permalink =
      "https://example.slack.com/archives/C123/p1789431300000000";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, permalink })));
    await expect(
      getMessagePermalink({ channel: "C123", messageTs: "1789431300.000000" }),
    ).resolves.toBe(permalink);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(
      "chat.getPermalink?channel=C123&message_ts=1789431300.000000",
    );
    expect(String(url)).not.toContain("xoxb-test");
    expect(init?.headers).toMatchObject({ authorization: "Bearer xoxb-test" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    { ok: true },
    { ok: true, permalink: 123 },
  ])("원문 링크가 없으면 오류를 반환한다", async (response) => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(response)),
    );
    await expect(
      getMessagePermalink({ channel: "C123", messageTs: "1.2" }),
    ).rejects.toMatchObject({ error_code: "slack_api_failed" });
  });
  it("삭제된 메시지는 재생성이 필요한 오류로 구분한다", async () => {
    process.env.SLACK_BOT_TOKEN="xoxb-test";
    vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({ok:false,error:"message_not_found"})));
    await expect(getMessagePermalink({channel:"C123",messageTs:"1.1"})).rejects.toMatchObject({error_code:"slack_message_missing"});
  });

  it("선택적인 원문 링크 조회는 rate limit에서 대기 재시도하지 않는다", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: "ratelimited" }), {
          status: 429,
          headers: { "retry-after": "120" },
        }),
      );
    await expect(
      getMessagePermalink({ channel: "C123", messageTs: "1.2" }),
    ).rejects.toMatchObject({ error_code: "slack_rate_limited" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
