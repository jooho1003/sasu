import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), search: vi.fn(), decisions: vi.fn(),
  structured: vi.fn(), post: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => mocks }));
vi.mock("@/lib/embeddings", () => ({ embedText: async () => ({ vector: [0.1] }) }));
vi.mock("@/lib/search", () => ({ searchAs: mocks.search, recentDecisionsAs: mocks.decisions }));
vi.mock("@/lib/llm", () => ({ llm: { structured: mocks.structured } }));
vi.mock("@/lib/slack/post", () => ({ postMessage: mocks.post }));
vi.mock("@/lib/jobs", () => ({ registerHandler: vi.fn() }));

import { answerQuestion } from "@/lib/pipeline/answer";

describe("answer publication boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: {
      id: "answer-1", dept_id: "dept-1", asked_by: "lead-1", question: "합성 테스트 질문", status: "pending",
    }, error: null });
    mocks.from.mockReturnValue(query);
    mocks.search.mockResolvedValue([{ id: "item-1", content: "확인된 근거", source_visibility: "dept" }]);
    mocks.decisions.mockResolvedValue([]);
    mocks.structured.mockResolvedValue({ data: {
      citations: [{ item_id: "item-1", decision_id: null, quote: "확인된 근거" }],
      answer: "근거를 확인했습니다.", refused: false,
    } });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  it("채널 응답은 팀장 질문도 두 검색 모두 channel 범위로 제한한다", async () => {
    await answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" });
    expect(mocks.search).toHaveBeenCalledWith(mocks, expect.objectContaining({ scope: "channel" }));
    expect(mocks.decisions).toHaveBeenCalledWith(mocks, expect.objectContaining({ scope: "channel" }));
  });

  it("웹 질문은 질문자 범위를 유지한다", async () => {
    await answerQuestion("answer-1");
    expect(mocks.search).toHaveBeenCalledWith(mocks, expect.objectContaining({ scope: "user", userId: "lead-1" }));
  });

  it("답변과 검증된 인용을 한 트랜잭션으로 저장한다", async () => {
    await answerQuestion("answer-1");
    expect(mocks.rpc).toHaveBeenCalledWith("complete_answer", expect.objectContaining({
      p_answer_id: "answer-1", p_refused: false,
      p_citations: [{ item_id: "item-1", decision_id: null, quote: "확인된 근거" }],
    }));
  });

  it("인용 저장 실패는 재시도 가능한 오류로 남고 Slack에 게시하지 않는다", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    await expect(answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" })).rejects.toThrow("database operation failed");
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("스윕이 먼저 종료한 답변은 Slack에 늦게 게시하지 않는다", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" });
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("일부 인용만 유효한 초안은 재생성 후에도 실패하면 전체 거절한다", async () => {
    mocks.structured.mockResolvedValue({ data: {
      answer: "확인된 근거와 근거 없는 추가 주장", refused: false,
      citations: [
        { item_id: "item-1", decision_id: null, quote: "확인된 근거" },
        { item_id: "item-1", decision_id: null, quote: "존재하지 않는 내용" },
      ],
    } });
    await answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" });
    expect(mocks.structured).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledWith("complete_answer", expect.objectContaining({ p_refused: true, p_citations: [], p_error_code: "citation_invalid" }));
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("추가 주장");
    expect(JSON.stringify(mocks.post.mock.calls)).not.toContain("추가 주장");
  });

  it("첫 초안이 잘못되어도 두 번째 인용 전체가 유효하면 두 번째 답변만 게시한다", async () => {
    mocks.structured.mockResolvedValueOnce({ data: { answer: "잘못된 초안", refused: false, citations: [] } });
    await answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" });
    expect(mocks.structured).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledWith("complete_answer", expect.objectContaining({ p_refused: false, p_answer: "근거를 확인했습니다." }));
    expect(JSON.stringify(mocks.post.mock.calls)).not.toContain("잘못된 초안");
  });

  it("모델이 refused이면 자유 서술 초안을 게시하지 않는다", async () => {
    mocks.structured.mockResolvedValue({ data: { answer: "검증되지 않은 거절 이유", refused: true, citations: [] } });
    await answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" });
    expect(mocks.structured).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("검증되지 않은");
    expect(JSON.stringify(mocks.post.mock.calls)).not.toContain("검증되지 않은");
  });

  it("실제 게이트웨이의 llm_refusal 오류도 failed가 아니라 refused로 종료한다", async () => {
    mocks.structured.mockRejectedValue({ error_code: "llm_refusal" });
    await answerQuestion("answer-1");
    expect(mocks.rpc).toHaveBeenCalledWith("complete_answer", expect.objectContaining({ p_refused: true, p_citations: [] }));
  });

  it("네트워크 오류를 근거 부족으로 숨기지 않는다", async () => {
    mocks.structured.mockRejectedValue(new Error("network unavailable"));
    await expect(answerQuestion("answer-1")).rejects.toThrow("network unavailable");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
