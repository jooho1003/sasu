import { beforeEach, describe, expect, it, vi } from "vitest";

const moduleMocks = vi.hoisted(() => ({
  createServiceSupabaseClient: vi.fn(),
  openDirectMessage: vi.fn(),
  postMessage: vi.fn(),
  registerHandler: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: moduleMocks.createServiceSupabaseClient,
}));
vi.mock("@/lib/slack/post", () => ({
  openDirectMessage: moduleMocks.openDirectMessage,
  postMessage: moduleMocks.postMessage,
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
    moduleMocks.registerHandler.mockReset();
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

  it("send_slack handler를 등록한다", () => {
    registerSendSlackHandler();
    expect(moduleMocks.registerHandler).toHaveBeenCalledWith(
      "send_slack",
      expect.any(Function),
    );
  });
});
