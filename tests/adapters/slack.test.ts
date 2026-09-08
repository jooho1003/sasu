import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const moduleMocks = vi.hoisted(() => ({
  createServiceSupabaseClient: vi.fn(),
  enqueue: vi.fn(),
  kickWorker: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: moduleMocks.createServiceSupabaseClient,
}));
vi.mock("@/lib/jobs", () => ({
  enqueue: moduleMocks.enqueue,
  kickWorker: moduleMocks.kickWorker,
}));

import { POST } from "@/app/api/slack/events/route";
import {
  isCollectible,
  type SlackMessageEvent,
  toIngestItem,
} from "@/lib/adapters/slack";

const baseEvent: SlackMessageEvent = {
  type: "message",
  channel: "C123",
  user: "U123",
  text: "외주사에 010-1234-5678로 연락해 주세요.",
  ts: "1788868800.000100",
};

function makeLookup(data: unknown) {
  const chain = {
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  chain.eq.mockReturnValue(chain);
  return chain;
}

describe("Slack adapter", () => {
  beforeEach(() => {
    moduleMocks.createServiceSupabaseClient.mockReset();
    moduleMocks.enqueue.mockReset();
    moduleMocks.kickWorker.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each<{ event: SlackMessageEvent; label: string }>([
    { event: { ...baseEvent, bot_id: "B123" }, label: "bot_id가 있는 봇 메시지" },
    { event: { ...baseEvent, subtype: "bot_message" }, label: "bot_message subtype" },
    {
      event: { ...baseEvent, text: "", files: [{ id: "F123" }] },
      label: "본문 없는 파일 메시지",
    },
    { event: { ...baseEvent, text: ":wave:" }, label: "이모지만 있는 메시지" },
    { event: { ...baseEvent, subtype: "channel_join" }, label: "채널 조인 알림" },
    { event: { ...baseEvent, subtype: "channel_leave" }, label: "채널 퇴장 알림" },
  ])("봇 메시지·본문 없는 메시지·조인 알림을 수집 제외한다: $label", ({ event }) => {
    expect(isCollectible(event)).toBe(false);
    expect(
      toIngestItem(event, { sourceId: "source-1", deptId: "dept-1" }),
    ).toBeNull();
  });

  it("스레드 답글은 수집한다", () => {
    const event = {
      ...baseEvent,
      ts: "1788868801.000200",
      thread_ts: "1788868800.000100",
    };

    expect(isCollectible(event)).toBe(true);
    expect(
      toIngestItem(event, { sourceId: "source-1", deptId: "dept-1" }),
    ).toEqual(
      expect.objectContaining({
        external_ref: "1788868801.000200",
        author_ext_id: "U123",
      }),
    );
  });

  it("content는 mask()를 통과한 값이라 전화번호가 남아 있지 않다", () => {
    const item = toIngestItem(baseEvent, {
      sourceId: "source-1",
      deptId: "dept-1",
    });

    expect(item?.content).toBe("외주사에 [전화번호]로 연락해 주세요.");
    expect(item?.content).not.toContain("010-1234-5678");
  });

  it("미동의 author_ext_id의 메시지는 IngestItem을 만들지 않는다", async () => {
    const signingSecret = "test-signing-secret";
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const rawBody = JSON.stringify({
      type: "event_callback",
      event_id: "Ev-unconsented",
      event: baseEvent,
    });
    const signature = `v0=${createHmac("sha256", signingSecret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest("hex")}`;
    const itemUpsert = vi.fn();
    const sourceLookup = makeLookup({ id: "source-1", dept_id: "dept-1" });
    const memberLookup = makeLookup({
      display_name: "미동의 구성원",
      consented_at: null,
    });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "ingest_events") {
          return {
            insert: vi.fn(async () => ({ data: null, error: null })),
          };
        }
        if (table === "sources") {
          return { select: vi.fn(() => sourceLookup) };
        }
        if (table === "members") {
          return { select: vi.fn(() => memberLookup) };
        }
        if (table === "items") {
          return { upsert: itemUpsert };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };
    moduleMocks.createServiceSupabaseClient.mockReturnValue(client);
    vi.stubEnv("SLACK_SIGNING_SECRET", signingSecret);

    const response = await POST(
      new Request("http://localhost/api/slack/events", {
        method: "POST",
        headers: {
          "x-slack-request-timestamp": timestamp,
          "x-slack-signature": signature,
        },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(200);
    expect(itemUpsert).not.toHaveBeenCalled();
    expect(moduleMocks.enqueue).not.toHaveBeenCalled();
    expect(moduleMocks.kickWorker).not.toHaveBeenCalled();
  });
});
