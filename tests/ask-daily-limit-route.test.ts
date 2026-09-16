import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  kickWorker: vi.fn(),
  requireMembership: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/jobs", () => ({ enqueue: mocks.enqueue, kickWorker: mocks.kickWorker, registerHandler: vi.fn() }));
vi.mock("@/lib/pipeline/answer", () => ({ registerAnswerHandler: vi.fn() }));
vi.mock("@/lib/pipeline/card", () => ({ registerMakeCardHandler: vi.fn() }));
vi.mock("@/lib/pipeline/classify", () => ({ registerClassifyHandler: vi.fn() }));
vi.mock("@/lib/pipeline/embed", () => ({ registerEmbedHandler: vi.fn() }));
vi.mock("@/lib/pipeline/meeting-summary", () => ({ registerMeetingSummaryHandler: vi.fn() }));
vi.mock("@/lib/pipeline/notion-import", () => ({ registerNotionImportHandler: vi.fn() }));
vi.mock("@/lib/pipeline/send-slack", () => ({ registerSendSlackHandler: vi.fn() }));
vi.mock("@/lib/pipeline/slack-backfill", () => ({ registerSlackBackfillHandler: vi.fn() }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.requireMembership }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    rpc: mocks.insert,
  }),
}));

import { POST } from "@/app/api/d/[dept]/ask/route";

describe("웹 ASK 일일 한도", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireMembership.mockResolvedValue({ deptId: "dept-1", userId: "user-1" });
    mocks.insert.mockResolvedValue({ data: null, error: { code: "P0001", message: "ask_daily_limit" } });
  });

  it("answers INSERT의 ask_daily_limit 오류를 429와 한국어 안내로 반환한다", async () => {
    const response = await POST(new Request("http://localhost/api/d/dept-1/ask", {
      method: "POST", body: JSON.stringify({ question: "합성 질문입니다" }),
    }), { params: Promise.resolve({ dept: "dept-1" }) });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "ask_daily_limit",
      message: "오늘 질문 한도(50회)를 모두 사용했습니다. 내일 다시 물어봐 주세요.",
    });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
