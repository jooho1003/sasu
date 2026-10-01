import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildInbox,
  loadInbox,
  type InboxRows,
} from "@/lib/companion/inbox";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const DEPT_ID = "22222222-2222-4222-8222-222222222222";
const LINK_ID = "33333333-3333-4333-8333-333333333333";
const ANSWER_ID = "44444444-4444-4444-8444-444444444444";
const CARD_ID = "55555555-5555-4555-8555-555555555555";
const REVIEW_ID = "66666666-6666-4666-8666-666666666666";

type QueryResult = { data: unknown[] | null; error: { message: string } | null };

function query(result: QueryResult, operations: unknown[][]) {
  const builder = {
    select: vi.fn((...args: unknown[]) => {
      operations.push(["select", ...args]);
      return builder;
    }),
    eq: vi.fn((...args: unknown[]) => {
      operations.push(["eq", ...args]);
      return builder;
    }),
    neq: vi.fn((...args: unknown[]) => {
      operations.push(["neq", ...args]);
      return builder;
    }),
    gte: vi.fn((...args: unknown[]) => {
      operations.push(["gte", ...args]);
      return builder;
    }),
    in: vi.fn((...args: unknown[]) => {
      operations.push(["in", ...args]);
      return builder;
    }),
    order: vi.fn((...args: unknown[]) => {
      operations.push(["order", ...args]);
      return builder;
    }),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

function clientFor(
  results: Record<string, QueryResult>,
  calls: Record<string, unknown[][]>,
) {
  return {
    from: vi.fn((table: string) => {
      calls[table] ??= [];
      return query(results[table], calls[table]);
    }),
  } as unknown as SupabaseClient;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("buildInbox", () => {
  it("keeps only the compact 24-hour summary fields", () => {
    const now = new Date("2026-10-02T12:00:00.000Z");
    const rows = {
      answers: [
        {
          id: ANSWER_ID,
          status: "done",
          created_at: "2026-10-02T11:00:00.000Z",
          question: "요약 응답에 들어가면 안 되는 질문 원문",
        },
        {
          id: "77777777-7777-4777-8777-777777777777",
          status: "failed",
          created_at: "2026-09-30T11:00:00.000Z",
        },
      ],
      cards: [
        {
          id: CARD_ID,
          title: "견적 승인하기",
          deadline: null,
          status: "open",
          background: "요약 응답에 들어가면 안 되는 카드 배경",
        },
      ],
      reviews: [
        {
          id: REVIEW_ID,
          kind: "document",
          title: "견적서",
          status: "processing",
          created_at: "2026-10-02T10:00:00.000Z",
        },
        {
          id: "88888888-8888-4888-8888-888888888888",
          kind: "audio",
          title: "지난 회의",
          status: "ready",
          created_at: "2026-09-30T10:00:00.000Z",
        },
      ],
    } as unknown as InboxRows;

    expect(buildInbox(rows, now)).toEqual({
      server_time: now.toISOString(),
      cards: [
        {
          id: CARD_ID,
          title: "견적 승인하기",
          deadline: null,
          status: "open",
        },
      ],
      answers: [
        {
          id: ANSWER_ID,
          status: "done",
          created_at: "2026-10-02T11:00:00.000Z",
        },
      ],
      reviews: [
        {
          id: REVIEW_ID,
          kind: "document",
          title: "견적서",
          status: "processing",
        },
      ],
      sales: [],
    });
  });
});

describe("loadInbox", () => {
  it("loads a lead's own compact rows with the user JWT client", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T12:00:00.000Z"));
    const calls: Record<string, unknown[][]> = {};
    const client = clientFor(
      {
        answers: {
          data: [
            {
              id: ANSWER_ID,
              status: "pending",
              created_at: "2026-10-02T11:00:00.000Z",
            },
          ],
          error: null,
        },
        decision_requests: {
          data: [
            {
              id: CARD_ID,
              title: "견적 승인하기",
              deadline: null,
              status: "needs_review",
            },
          ],
          error: null,
        },
        reviewed_materials: {
          data: [
            {
              id: REVIEW_ID,
              kind: "document",
              title: "견적서",
              status: "ready",
              created_at: "2026-10-02T10:00:00.000Z",
            },
          ],
          error: null,
        },
      },
      calls,
    );

    const result = await loadInbox({
      client,
      userId: USER_ID,
      deptId: DEPT_ID,
      role: "lead",
      consentedAt: "2026-10-01T00:00:00.000Z",
      linkId: LINK_ID,
    });

    expect(result).toMatchObject({
      ok: true,
      status: 200,
      body: {
        cards: [{ id: CARD_ID, status: "needs_review" }],
        answers: [{ id: ANSWER_ID, status: "pending" }],
        reviews: [{ id: REVIEW_ID, status: "ready" }],
        sales: [],
      },
    });
    expect(calls.answers).toContainEqual(["eq", "asked_by", USER_ID]);
    expect(calls.answers).toContainEqual(["eq", "dept_id", DEPT_ID]);
    expect(calls.answers).toContainEqual([
      "gte",
      "created_at",
      "2026-10-01T12:00:00.000Z",
    ]);
    expect(calls.decision_requests).toContainEqual([
      "eq",
      "assignee_id",
      USER_ID,
    ]);
    expect(calls.decision_requests).toContainEqual([
      "in",
      "status",
      ["open", "needs_review"],
    ]);
    expect(calls.reviewed_materials).toContainEqual([
      "eq",
      "created_by",
      USER_ID,
    ]);
    expect(calls.reviewed_materials).toContainEqual([
      "neq",
      "status",
      "deleted",
    ]);
  });

  it("does not query review rows or needs-review cards for a member", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T12:00:00.000Z"));
    const calls: Record<string, unknown[][]> = {};
    const client = clientFor(
      {
        answers: { data: [], error: null },
        decision_requests: { data: [], error: null },
      },
      calls,
    );

    const result = await loadInbox({
      client,
      userId: USER_ID,
      deptId: DEPT_ID,
      role: "member",
      consentedAt: "2026-10-01T00:00:00.000Z",
      linkId: LINK_ID,
    });

    expect(result).toMatchObject({ ok: true, body: { reviews: [] } });
    expect(client.from).not.toHaveBeenCalledWith("reviewed_materials");
    expect(calls.decision_requests).toContainEqual(["eq", "status", "open"]);
    expect(calls.decision_requests.some(([method]) => method === "in")).toBe(
      false,
    );
  });

  it("returns one stable failure without exposing database details", async () => {
    const calls: Record<string, unknown[][]> = {};
    const client = clientFor(
      {
        answers: { data: null, error: { message: "private database detail" } },
        decision_requests: { data: [], error: null },
      },
      calls,
    );

    await expect(
      loadInbox({
        client,
        userId: USER_ID,
        deptId: DEPT_ID,
        role: "member",
        consentedAt: null,
        linkId: LINK_ID,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 500,
      error: "받은 일을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
      code: "inbox_failed",
    });
  });
});
