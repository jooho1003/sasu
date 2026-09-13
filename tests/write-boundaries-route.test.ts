import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  enqueue: vi.fn(),
  kickWorker: vi.fn(),
  openModal: vi.fn(),
  postMessage: vi.fn(),
  requireMembership: vi.fn(),
  serverFrom: vi.fn(),
  serverRpc: vi.fn(),
  serviceFrom: vi.fn(),
  serviceRpc: vi.fn(),
  updateMessage: vi.fn(),
  verifySlackSignature: vi.fn(),
  writes: [] as Array<{ table: string; action: string }>,
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/jobs", () => ({
  enqueue: mocks.enqueue,
  kickWorker: mocks.kickWorker,
  registerHandler: vi.fn(),
}));
vi.mock("@/lib/pipeline/answer", () => ({ registerAnswerHandler: vi.fn() }));
vi.mock("@/lib/pipeline/card", () => ({ registerMakeCardHandler: vi.fn() }));
vi.mock("@/lib/pipeline/classify", () => ({ registerClassifyHandler: vi.fn() }));
vi.mock("@/lib/pipeline/embed", () => ({ registerEmbedHandler: vi.fn() }));
vi.mock("@/lib/pipeline/meeting-summary", () => ({ registerMeetingSummaryHandler: vi.fn() }));
vi.mock("@/lib/pipeline/notion-import", () => ({ registerNotionImportHandler: vi.fn() }));
vi.mock("@/lib/pipeline/send-slack", () => ({ registerSendSlackHandler: vi.fn() }));
vi.mock("@/lib/pipeline/slack-backfill", () => ({ registerSlackBackfillHandler: vi.fn() }));
vi.mock("@/lib/supabase/membership", () => ({
  requireMembership: mocks.requireMembership,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    from: mocks.serverFrom,
    rpc: mocks.serverRpc,
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => ({
    from: mocks.serviceFrom,
    rpc: mocks.serviceRpc,
  }),
}));
vi.mock("@/lib/slack/verify", () => ({
  verifySlackSignature: mocks.verifySlackSignature,
}));
vi.mock("@/lib/slack/blocks", () => ({ buildDecisionModal: vi.fn() }));
vi.mock("@/lib/slack/post", () => ({
  openModal: mocks.openModal,
  postMessage: mocks.postMessage,
  updateMessage: mocks.updateMessage,
}));

import { POST as promoteItem } from "@/app/api/d/[dept]/cards/route";
import { POST as decideCard } from "@/app/api/cards/[id]/decide/route";
import { POST as recordDirectDecision } from "@/app/api/d/[dept]/decisions/route";
import { POST as handleSlackInteraction } from "@/app/api/slack/interactions/route";

const membership = {
  userId: "11111111-1111-4111-8111-111111111111",
  deptId: "22222222-2222-4222-8222-222222222222",
  role: "lead" as const,
  displayName: "합성 팀장",
};
const itemId = "33333333-3333-4333-8333-333333333333";
const cardId = "44444444-4444-4444-8444-444444444444";
const decisionId = "55555555-5555-4555-8555-555555555555";
const jobId = "66666666-6666-4666-8666-666666666666";

function query(table: string, data: unknown, error: unknown = null) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    insert: vi.fn(() => {
      mocks.writes.push({ table, action: "insert" });
      return builder;
    }),
    update: vi.fn(() => {
      mocks.writes.push({ table, action: "update" });
      return builder;
    }),
    delete: vi.fn(() => {
      mocks.writes.push({ table, action: "delete" });
      return builder;
    }),
    maybeSingle: vi.fn(async () => ({ data, error })),
    single: vi.fn(async () => ({ data, error })),
    then: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data, error }).then(resolve, reject),
  };
  return builder;
}

function card() {
  return {
    id: cardId,
    dept_id: membership.deptId,
    origin_item_id: itemId,
    title: "합성 카드",
    recommendation: "승인",
    assignee_id: membership.userId,
    status: "open",
    opened_at: "2026-09-13T00:00:00.000Z",
  };
}

describe("명령별 쓰기 RPC 경계", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.writes.length = 0;
    mocks.requireMembership.mockResolvedValue(membership);
    mocks.verifySlackSignature.mockReturnValue(true);
    mocks.enqueue.mockResolvedValue(jobId);
    mocks.serverRpc.mockResolvedValue({ data: jobId, error: null });
    mocks.serviceRpc.mockResolvedValue({
      data: {
        ok: true,
        duplicate: false,
        status: "decided",
        decision_id: decisionId,
        decided_by_name: membership.displayName,
        decided_at: "2026-09-13T01:00:00.000Z",
      },
      error: null,
    });
    mocks.serverFrom.mockImplementation((table: string) => {
      if (table === "items") return query(table, { id: itemId, content: "합성 근거" });
      if (table === "decision_requests") return query(table, card());
      if (table === "decisions") return query(table, null);
      if (table === "citations") return query(table, null);
      throw new Error(`unexpected server table: ${table}`);
    });
    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table === "decision_requests") return query(table, card());
      if (table === "members") {
        return query(table, {
          user_id: membership.userId,
          display_name: membership.displayName,
          role: membership.role,
          consented_at: "2026-09-13T00:00:00.000Z",
        });
      }
      if (table === "decisions") return query(table, null);
      if (table === "items") {
        return query(table, {
          external_ref: "1726123456.123",
          sources: { kind: "slack_channel", external_id: "C_SYNTHETIC" },
        });
      }
      throw new Error(`unexpected service table: ${table}`);
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("항목 승격은 promote_item RPC만으로 make_card job을 만든다", async () => {
    mocks.serverFrom.mockImplementation((table: string) => {
      if (table === "items") return query(table, { id: itemId });
      if (table === "decision_requests") return query(table, null);
      throw new Error(`unexpected server table: ${table}`);
    });

    const response = await promoteItem(
      new Request("http://localhost/api/d/dept/cards", {
        method: "POST",
        body: JSON.stringify({ origin_item_id: itemId }),
      }),
      { params: Promise.resolve({ dept: membership.deptId }) },
    );

    expect(response.status).toBe(202);
    expect(mocks.serverRpc).toHaveBeenCalledWith("promote_item", { p_item: itemId });
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.kickWorker).toHaveBeenCalledOnce();
  });

  it("웹 카드 결정은 decide_request RPC를 호출하고 테이블을 직접 쓰지 않는다", async () => {
    mocks.serverRpc.mockResolvedValue({
      data: {
        ok: true,
        duplicate: false,
        status: "decided",
        decision_id: decisionId,
        decided_by_name: membership.displayName,
        decided_at: "2026-09-13T01:00:00.000Z",
      },
      error: null,
    });

    const response = await decideCard(
      new Request("http://localhost/api/cards/id/decide", {
        method: "POST",
        body: JSON.stringify({
          status: "decided",
          outcome: "승인",
          rationale: "합성 근거를 확인했습니다.",
        }),
      }),
      { params: Promise.resolve({ id: cardId }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.serverRpc).toHaveBeenCalledWith("decide_request", {
      p_request: cardId,
      p_action: "decide",
      p_outcome: "승인",
      p_rationale: "합성 근거를 확인했습니다.",
    });
    expect(mocks.writes).toEqual([]);
  });

  it("이미 결정된 카드는 기존 결정자·시각·원장 번호 문구를 유지한다", async () => {
    mocks.serverFrom.mockImplementation((table: string) => {
      if (table === "decision_requests") return query(table, card());
      if (table === "decisions") {
        return query(table, {
          id: decisionId,
          decided_by_name: membership.displayName,
          decided_at: "2026-09-13T01:00:00.000Z",
        });
      }
      throw new Error(`unexpected server table: ${table}`);
    });

    const response = await decideCard(
      new Request("http://localhost/api/cards/id/decide", {
        method: "POST",
        body: JSON.stringify({ status: "decided" }),
      }),
      { params: Promise.resolve({ id: cardId }) },
    );
    const body = await response.json();

    expect(body.duplicate).toBe(true);
    expect(body.message).toContain(`이미 ${membership.displayName}이(가)`);
    expect(body.message).toContain(`원장 #${decisionId.slice(0, 8)}`);
    expect(mocks.serverRpc).not.toHaveBeenCalled();
  });

  it("직접 기록은 근거 quote와 함께 record_direct_decision RPC 한 번으로 저장한다", async () => {
    mocks.serverRpc.mockResolvedValue({ data: decisionId, error: null });

    const response = await recordDirectDecision(
      new Request("http://localhost/api/d/dept/decisions", {
        method: "POST",
        body: JSON.stringify({
          outcome: "직접 승인",
          rationale: "합성 근거를 직접 검토했습니다.",
          evidence_item_id: itemId,
        }),
      }),
      { params: Promise.resolve({ dept: membership.deptId }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.serverRpc).toHaveBeenCalledWith("record_direct_decision", {
      p_dept: membership.deptId,
      p_outcome: "직접 승인",
      p_rationale: "합성 근거를 직접 검토했습니다.",
      p_citations: [{ item_id: itemId, quote: "합성 근거" }],
    });
    expect(mocks.writes).toEqual([]);
  });

  it("Slack 모달 결정은 매핑된 사용자로 decide_request_as RPC를 호출한다", async () => {
    vi.stubEnv("SLACK_SIGNING_SECRET", "synthetic-secret");
    const payload = {
      type: "view_submission",
      user: { id: "U_SYNTHETIC" },
      view: {
        callback_id: "sasu_decision_modal",
        private_metadata: JSON.stringify({ requestId: cardId, status: "decided" }),
        state: {
          values: {
            sasu_outcome: { value: { value: "승인" } },
            sasu_rationale: { value: { value: "합성 근거를 확인했습니다." } },
          },
        },
      },
    };
    const body = new URLSearchParams({ payload: JSON.stringify(payload) }).toString();

    const response = await handleSlackInteraction(
      new Request("http://localhost/api/slack/interactions", {
        method: "POST",
        body,
        headers: {
          "x-slack-request-timestamp": "1",
          "x-slack-signature": "v0=synthetic",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.serviceRpc).toHaveBeenCalledWith("decide_request_as", {
      p_user: membership.userId,
      p_request: cardId,
      p_action: "decide",
      p_outcome: "승인",
      p_rationale: "합성 근거를 확인했습니다.",
    });
    expect(mocks.writes).toEqual([]);
  });
});
