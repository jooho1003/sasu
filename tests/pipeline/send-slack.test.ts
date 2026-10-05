import { beforeEach, describe, expect, it, vi } from "vitest";

const moduleMocks = vi.hoisted(() => ({
  createServiceSupabaseClient: vi.fn(),
  openDirectMessage: vi.fn(),
  postMessage: vi.fn(),
  updateMessage: vi.fn(),
  registerHandler: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: moduleMocks.createServiceSupabaseClient,
}));
vi.mock("@/lib/slack/post", () => ({
  openDirectMessage: moduleMocks.openDirectMessage,
  postMessage: moduleMocks.postMessage,
  updateMessage: moduleMocks.updateMessage,
}));
vi.mock("@/lib/jobs", () => ({
  registerHandler: moduleMocks.registerHandler,
}));

import {
  buildSlackCardView,
  registerSendSlackHandler,
  sendSlackCard,
} from "@/lib/pipeline/send-slack";

type Row = Record<string, unknown>;

function makeBuilder(data: unknown, error: unknown = null) {
  const builder = Promise.resolve({ data, error }) as Promise<unknown> & Record<string, (...args: unknown[]) => unknown>;
  builder.eq = () => builder;
  builder.in = () => builder;
  builder.select = () => builder;
  builder.update = () => builder;
  builder.maybeSingle = () => builder;
  builder.single = () => builder;
  return builder;
}

function createClient() {
  const state = {
    updates: [] as Row[],
  };
  const from = vi.fn((table: string) => {
    if (table === "decision_requests") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => makeBuilder({
              id: "card-1",
              dept_id: "dept-1",
              title: "결정 카드",
              background: "배경",
              recommendation: "추천",
              deadline: null,
              assignee_id: "user-1",
              visibility: "dept",
              status: "open",
              slack_delivery_status: "pending",
            }),
          }),
        }),
        update: (values: Row) => {
          state.updates.push(values);
          return makeBuilder(null);
        },
      };
    }
    if (table === "members") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => makeBuilder({
                slack_user_id: "U123",
                consented_at: "2026-09-10T00:00:00.000Z",
                role: "lead",
              }),
            }),
          }),
        }),
      };
    }
    if (table === "citations") {
      return {
        select: () => ({
          eq: () => makeBuilder([
            { quote: "원문 인용", item_id: "item-1", decision_id: null },
          ]),
        }),
      };
    }
    if (table === "items") {
      return {
        select: () => ({
          in: () => makeBuilder([
            {
              id: "item-1",
              external_ref: "1725000000.000100",
              sources: { kind: "slack_channel", external_id: "C123" },
            },
          ]),
        }),
      };
    }
    if (table === "conflicts") {
      return {
        select: () => ({
          eq: () => makeBuilder([]),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { client: { from }, state };
}

describe("Slack 결정 카드 발송", () => {
  beforeEach(() => {
    moduleMocks.createServiceSupabaseClient.mockReset();
    moduleMocks.openDirectMessage.mockReset();
    moduleMocks.postMessage.mockReset();
    moduleMocks.updateMessage.mockReset();
    moduleMocks.registerHandler.mockReset();
  });
  it("근거가 바뀐 카드는 기존 DM을 고정 재검토 안내로 교체하고 새 DM을 보내지 않는다", async () => {
    moduleMocks.createServiceSupabaseClient.mockReturnValue({ from: () => makeBuilder({ id: "card-1", source_invalidated: true, slack_channel_id: "DQA", slack_message_ts: "123.001", background: "이전 비밀 본문" }) });
    moduleMocks.updateMessage.mockResolvedValue({});
    await sendSlackCard("card-1");
    expect(moduleMocks.updateMessage).toHaveBeenCalledWith(expect.objectContaining({ channel: "DQA", ts: "123.001", text: expect.stringContaining("재검토") }));
    expect(JSON.stringify(moduleMocks.updateMessage.mock.calls)).not.toContain("비밀");
    expect(moduleMocks.postMessage).not.toHaveBeenCalled();
  });

  it("카드 데이터로 인용 링크와 DM용 블록 입력을 만든다", () => {
    const view = buildSlackCardView({
      card: {
        id: "card-1",
        title: "결정 카드",
        background: "배경",
        recommendation: "추천",
        deadline: null,
        visibility: "dept",
        citations: [{ quote: "원문", href: "https://slack.com/archives/C/p1" }],
        conflicts: [],
      },
      webUrl: "https://sasu.example/d/dept-1/cards/card-1",
    });

    expect(view).toMatchObject({
      id: "card-1",
      webUrl: "https://sasu.example/d/dept-1/cards/card-1",
      citations: [{ quote: "원문", href: "https://slack.com/archives/C/p1" }],
    });
  });

  it("동의한 담당자에게 DM을 보내고 delivery 상태를 sent로 기록한다", async () => {
    const fake = createClient();
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    moduleMocks.openDirectMessage.mockResolvedValue({ id: "D123" });
    moduleMocks.postMessage.mockResolvedValue({ channel: "D123", ts: "1.2" });

    await sendSlackCard("card-1");

    expect(moduleMocks.openDirectMessage).toHaveBeenCalledWith("U123");
    expect(moduleMocks.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "D123" }),
    );
    expect(fake.state.updates).toContainEqual(
      expect.objectContaining({
        slack_delivery_status: "sent",
        slack_message_ts: "1.2",
      }),
    );
  });

  it("카드 링크는 NEXT_PUBLIC_APP_URL을 쓰고 VERCEL_URL·APP_URL은 무시한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://getsasu.com");
    vi.stubEnv("VERCEL_URL", "preview-x.vercel.app");
    vi.stubEnv("APP_URL", "https://wrong.example");
    moduleMocks.createServiceSupabaseClient.mockReturnValue(createClient().client);
    moduleMocks.openDirectMessage.mockResolvedValue({ id: "D123" });
    moduleMocks.postMessage.mockResolvedValue({ channel: "D123", ts: "1.2" });
    await sendSlackCard("card-1");
    const sent = JSON.stringify(moduleMocks.postMessage.mock.calls);
    expect(sent).toContain("https://getsasu.com/d/dept-1/cards/card-1");
    expect(sent).not.toContain("preview-x.vercel.app");
    vi.unstubAllEnvs();
  });

  it("NEXT_PUBLIC_APP_URL이 없으면 VERCEL_PROJECT_PRODUCTION_URL로 카드 링크를 만든다", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "getsasu.com");
    moduleMocks.createServiceSupabaseClient.mockReturnValue(createClient().client);
    moduleMocks.openDirectMessage.mockResolvedValue({ id: "D123" });
    moduleMocks.postMessage.mockResolvedValue({ channel: "D123", ts: "1.2" });
    await sendSlackCard("card-1");
    expect(JSON.stringify(moduleMocks.postMessage.mock.calls)).toContain("https://getsasu.com/d/dept-1/cards/card-1");
    vi.unstubAllEnvs();
  });

  it("send_slack handler를 등록한다", () => {
    registerSendSlackHandler();
    expect(moduleMocks.registerHandler).toHaveBeenCalledWith(
      "send_slack",
      expect.any(Function),
    );
  });
});
