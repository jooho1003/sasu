import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  kickWorker: vi.fn(),
  rpc: vi.fn(),
  registerAnswerHandler: vi.fn(),
  registerClassifyHandler: vi.fn(),
  registerEmbedHandler: vi.fn(),
  registerMakeCardHandler: vi.fn(),
  registerMeetingSummaryHandler: vi.fn(),
  registerNotionImportHandler: vi.fn(),
  registerSendSlackHandler: vi.fn(),
  registerSlackBackfillHandler: vi.fn(),
}));

vi.mock("@/lib/jobs", () => ({ kickWorker: mocks.kickWorker }));
vi.mock("@/lib/pipeline/answer", () => ({ registerAnswerHandler: mocks.registerAnswerHandler }));
vi.mock("@/lib/pipeline/card", () => ({ registerMakeCardHandler: mocks.registerMakeCardHandler }));
vi.mock("@/lib/pipeline/classify", () => ({ registerClassifyHandler: mocks.registerClassifyHandler }));
vi.mock("@/lib/pipeline/embed", () => ({ registerEmbedHandler: mocks.registerEmbedHandler }));
vi.mock("@/lib/pipeline/meeting-summary", () => ({ registerMeetingSummaryHandler: mocks.registerMeetingSummaryHandler }));
vi.mock("@/lib/pipeline/notion-import", () => ({ registerNotionImportHandler: mocks.registerNotionImportHandler }));
vi.mock("@/lib/pipeline/send-slack", () => ({ registerSendSlackHandler: mocks.registerSendSlackHandler }));
vi.mock("@/lib/pipeline/slack-backfill", () => ({ registerSlackBackfillHandler: mocks.registerSlackBackfillHandler }));

import { startAsk } from "@/lib/ask-start";
import { jsonResult } from "@/lib/companion/context";

const ctx = {
  client: { rpc: mocks.rpc },
  userId: "user-1",
  deptId: "dept-1",
  role: "member" as const,
  consentedAt: "2026-10-02T00:00:00.000Z",
};

describe("startAsk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rpc.mockResolvedValue({ data: { answer_id: "answer-1", job_id: "job-1" }, error: null });
  });

  it("질문을 가리고 1,000자로 자른 뒤 answer job을 시작한다", async () => {
    const question = `test@example.com ${"가".repeat(1_100)}`;

    await expect(startAsk(ctx as never, { question })).resolves.toEqual({
      ok: true,
      status: 202,
      body: { answer_id: "answer-1", job_id: "job-1", truncated: true },
    });
    expect(mocks.rpc).toHaveBeenCalledWith("ask_question", {
      p_dept: "dept-1",
      p_question: expect.stringContaining("[이메일]"),
      p_parent: null,
    });
    expect(mocks.rpc.mock.calls[0][1].p_question).toHaveLength(1_000);
    expect(mocks.kickWorker).toHaveBeenCalledOnce();
    expect(mocks.registerAnswerHandler).toHaveBeenCalledOnce();
    expect(mocks.registerSlackBackfillHandler).toHaveBeenCalledOnce();
  });

  it("일일 한도는 429 ask_daily_limit으로 바꾼다", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "ask_daily_limit" } });

    await expect(startAsk(ctx as never, { question: "합성 질문입니다" })).resolves.toMatchObject({
      ok: false, status: 429, code: "ask_daily_limit",
    });
    expect(mocks.kickWorker).not.toHaveBeenCalled();
  });

  it("이어갈 수 없는 이전 질문은 403으로 바꾼다", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });

    await expect(startAsk(ctx as never, { question: "합성 질문입니다", parent_id: "parent-1" })).resolves.toMatchObject({
      ok: false, status: 403, code: "ask_parent_forbidden",
    });
  });

  it("웹 ASK의 기존 202·429 본문과 헤더를 유지한다", async () => {
    const accepted = jsonResult(
      {
        ok: true,
        status: 202,
        body: { answer_id: "answer-1", job_id: "job-1", truncated: false },
      },
      { cacheControl: false, legacy: "ask" },
    );
    expect(accepted.status).toBe(202);
    expect(accepted.headers.get("cache-control")).toBeNull();
    await expect(accepted.json()).resolves.toEqual({
      ok: true,
      answer_id: "answer-1",
      job_id: "job-1",
      truncated: false,
    });

    const limited = jsonResult(
      {
        ok: false,
        status: 429,
        code: "ask_daily_limit",
        error: "오늘 질문 한도(50회)를 모두 사용했습니다. 내일 다시 물어봐 주세요.",
      },
      { cacheControl: false, legacy: "ask" },
    );
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({
      error: "ask_daily_limit",
      message: "오늘 질문 한도(50회)를 모두 사용했습니다. 내일 다시 물어봐 주세요.",
    });
  });
});
