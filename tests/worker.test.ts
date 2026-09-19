import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ register: vi.fn(), run: vi.fn(), sweep: vi.fn(), reviewSweep:vi.fn(), notionPollSchedule: vi.fn() }));
vi.mock("@/lib/pipeline/review-material",()=>({registerReviewHandlers:()=>{mocks.register("process_review");mocks.register("purge_review_files");},sweepReviewParts:mocks.reviewSweep}));
vi.mock("@/lib/jobs", () => ({ runOnce: mocks.run, sweepPendingRows: mocks.sweep, registerHandler: vi.fn() }));
vi.mock("@/lib/pipeline/classify", () => ({ registerClassifyHandler: () => mocks.register("classify") }));
vi.mock("@/lib/pipeline/embed", () => ({ registerEmbedHandler: () => { mocks.register("embed"); mocks.register("embed_batch"); } }));
vi.mock("@/lib/pipeline/answer", () => ({ registerAnswerHandler: () => mocks.register("answer") }));
vi.mock("@/lib/pipeline/slack-answer-delivery", () => ({ registerSlackAnswerDeliveryHandler: () => mocks.register("deliver_slack_answer") }));
vi.mock("@/lib/pipeline/card", () => ({ registerMakeCardHandler: () => mocks.register("make_card") }));
vi.mock("@/lib/pipeline/meeting-summary", () => ({ registerMeetingSummaryHandler: () => mocks.register("summarize_meeting") }));
vi.mock("@/lib/pipeline/document-summary", () => ({ registerDocumentSummaryHandler: () => mocks.register("summarize_document") }));
vi.mock("@/lib/pipeline/agent-role", () => ({ registerAgentRoleHandler: () => mocks.register("run_agent_role") }));
vi.mock("@/lib/pipeline/notion-import", () => ({ registerNotionImportHandler: () => mocks.register("notion_import"), scheduleNotionSync: vi.fn() }));
vi.mock("@/lib/pipeline/notion-discover", () => ({ registerNotionDiscoverHandler: () => mocks.register("notion_discover") }));
vi.mock("@/lib/pipeline/notion-poll", () => ({ registerNotionPollHandler: () => mocks.register("notion_poll"), scheduleNotionPolls: mocks.notionPollSchedule }));
vi.mock("@/lib/pipeline/send-slack", () => ({ registerSendSlackHandler: () => mocks.register("send_slack") }));
vi.mock("@/lib/pipeline/slack-backfill", () => ({ registerSlackBackfillHandler: () => mocks.register("slack_backfill") }));
vi.mock("@/lib/pipeline/reminder", () => ({ registerReminderHandler: () => mocks.register("send_reminder"), scheduleCardReminders: vi.fn() }));
vi.mock("@/lib/pipeline/trailer-generate", () => ({ registerTrailerGenerateHandler: () => mocks.register("generate_trailer") }));
vi.mock("@/lib/pipeline/trailer-gate", () => ({ registerTrailerGateHandler: () => mocks.register("check_trailer_gate") }));
vi.mock("@/lib/pipeline/trailer-score", () => ({ registerTrailerScoreHandler: () => mocks.register("score_trailer_attempt") }));

import { runWorkerBulk, runWorkerOnce } from "@/lib/worker";
vi.mock("@/lib/pipeline/trailer-purge", () => ({ registerTrailerPurgeHandler: () => mocks.register("purge_trailer_invites") }));
vi.mock("@/lib/pipeline/retro-pull", () => ({ registerRetroPullHandler: () => mocks.register("retro_pull"), scheduleRetroPulls: vi.fn() }));

describe("공통 워커 진입점", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.run.mockResolvedValue({ claimed: 0, done: 0, failed: 0 });
    mocks.sweep.mockResolvedValue(undefined);
    mocks.notionPollSchedule.mockResolvedValue(undefined);
  });
  it("큐를 claim하기 전에 모든 파이프라인을 등록하고 독립 sweep을 실행한다", async () => {
    await runWorkerOnce();
    expect(mocks.register.mock.calls.map(([kind]) => kind).sort()).toEqual([
      "answer", "classify", "embed", "embed_batch", "make_card", "notion_discover", "notion_import", "notion_poll", "run_agent_role", "send_slack", "slack_backfill", "summarize_document", "summarize_meeting", "generate_trailer", "check_trailer_gate", "score_trailer_attempt", "deliver_slack_answer", "send_reminder", "process_review", "purge_review_files", "purge_trailer_invites", "retro_draft",
      "retro_pull",
    ].sort());
    expect(mocks.sweep).toHaveBeenCalledOnce();
    expect(mocks.reviewSweep).toHaveBeenCalledOnce();
    expect(mocks.sweep.mock.invocationCallOrder[0]).toBeLessThan(mocks.run.mock.invocationCallOrder[0]);
    expect(mocks.register.mock.invocationCallOrder.at(-1)).toBeLessThan(mocks.run.mock.invocationCallOrder[0]);
  });
  it("sweep 실패는 숨기지 않고 claim 전에 중단한다", async () => {
    mocks.sweep.mockRejectedValue(new Error("database operation failed"));
    await expect(runWorkerOnce()).rejects.toThrow("database operation failed");
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("claim 제한과 결과를 전달한다", async () => {
    mocks.run.mockResolvedValue({ claimed: 2, done: 2, failed: 0 });
    expect(await runWorkerOnce(2)).toEqual({ claimed: 2, done: 2, failed: 0 });
    expect(mocks.run).toHaveBeenCalledWith(2, "realtime");
  });
  it("bulk worker는 준비 작업을 한 번만 하고 25건 claim을 큐가 빌 때까지 반복한다", async () => {
    mocks.run
      .mockResolvedValueOnce({ claimed: 25, done: 25, failed: 0 })
      .mockResolvedValueOnce({ claimed: 3, done: 2, failed: 1 })
      .mockResolvedValueOnce({ claimed: 0, done: 0, failed: 0 });
    await expect(runWorkerBulk()).resolves.toEqual({ claimed: 28, done: 27, failed: 1 });
    expect(mocks.run).toHaveBeenNthCalledWith(1, 25, "bulk");
    expect(mocks.run).toHaveBeenNthCalledWith(2, 25, "bulk");
    expect(mocks.run).toHaveBeenNthCalledWith(3, 25, "bulk");
    expect(mocks.sweep).toHaveBeenCalledOnce();
    expect(mocks.reviewSweep).toHaveBeenCalledOnce();
  });
  it("bulk worker는 남은 시간이 30초 미만이면 새 claim을 시작하지 않는다", async () => {
    const now = vi.fn()
      .mockReturnValueOnce(0)
      .mockReturnValue(210_001);
    await expect(runWorkerBulk({ now })).resolves.toEqual({ claimed: 0, done: 0, failed: 0 });
    expect(mocks.run).not.toHaveBeenCalled();
  });
});

vi.mock("@/lib/pipeline/retro-draft", () => ({ registerRetroDraftHandler: () => mocks.register("retro_draft") }));
