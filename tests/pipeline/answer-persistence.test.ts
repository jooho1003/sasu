import { answerLead } from "@/lib/answer-grounding";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  search: vi.fn(),
  decisions: vi.fn(),
  structured: vi.fn(),
  post: vi.fn(),
  permalink: vi.fn(),
  metadata: vi.fn(),
  metadataSelect: vi.fn(),
  metadataDept: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => mocks,
}));
vi.mock("@/lib/embeddings", () => ({
  embedText: async () => ({ vector: [0.1] }),
}));
vi.mock("@/lib/search", () => ({
  searchAs: mocks.search,
  searchDecisionsAs: mocks.decisions,
}));
vi.mock("@/lib/llm", () => ({ llm: { structured: mocks.structured } }));
vi.mock("@/lib/slack/post", () => ({
  postMessage: mocks.post,
  getMessagePermalink: mocks.permalink,
}));
vi.mock("@/lib/jobs", () => ({ registerHandler: vi.fn() }));
vi.mock("@/lib/pipeline/slack-answer-delivery", () => ({ deliverSlackAnswer: vi.fn() }));

import { answerQuestion } from "@/lib/pipeline/answer";

describe("answer publication boundary", () => {
  it("조건·예외 범위를 저장하고 원문은 프롬프트와 Slack 인용에 한 번만 넣는다", async () => {
    const content = "지원 한도는 50만 원입니다.\n\n필수 교육은 한도가 없습니다.";
    mocks.search.mockResolvedValue([{ id: "policy", content, source_kind: "document", source_title: "교육 기준", source_visibility: "dept" }]);
    mocks.structured.mockResolvedValue({ data: { refused: false, citations: [{ evidence: 1, first_paragraph: 1, last_paragraph: 2 }] } });
    await answerQuestion("answer-1", { channel: "C123", threadTs: "1.1" });
    expect(mocks.rpc).toHaveBeenCalledWith("complete_answer", expect.objectContaining({ p_answer: answerLead(1), p_citations: [{ item_id: "policy", decision_id: null, quote: content }] }));
    const user = mocks.structured.mock.calls[0][2].user;
    expect(Array.isArray(JSON.parse(user).evidence)).toBe(true);
    expect(user.split("지원 한도는 50만 원입니다.")).toHaveLength(2);
    for (const value of ["policy", "content", "visibility"]) expect(user).not.toContain(value);
    expect(mocks.post.mock.calls[0][0].text.split(content)).toHaveLength(2);
  });
  it("재시도에는 선택 번호와 고정 실패 사유만 추가한다", async () => {
    mocks.structured.mockResolvedValueOnce({ data: { refused: false, citations: [{ evidence: 1, first_paragraph: 1, last_paragraph: 999 }] } });
    await answerQuestion("answer-1");
    const system = mocks.structured.mock.calls[1][2].system;
    expect(system).toContain("1번째 선택: 문단 번호가 근거의 문단 범위를 벗어났습니다");
    expect(system).not.toContain("확인된 근거");
    expect(system).not.toContain("합성 테스트 질문");
    expect(mocks.rpc).toHaveBeenCalledWith("complete_answer", expect.objectContaining({ p_refused: false, p_answer: answerLead(1) }));
  });
  it("올바른 인용에 붙인 잘못된 결론은 저장·게시하지 않는다", async () => {
    mocks.search.mockResolvedValue([{ id: "policy", content: "인상률 10% 이상이면 승인하지 않습니다.", source_kind: "document", source_title: "견적 기준", source_visibility: "dept" }]);
    mocks.structured.mockResolvedValue({ data: { answer: "12% 인상 견적을 승인하세요.", refused: false, citations: [{ evidence: 1, first_paragraph: 1, last_paragraph: 1 }] } });
    await answerQuestion("answer-1", { channel: "C123", threadTs: "1.1" });
    expect(mocks.rpc).toHaveBeenCalledWith("complete_answer", expect.objectContaining({ p_answer: answerLead(1) }));
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("승인하세요");
    expect(JSON.stringify(mocks.post.mock.calls)).not.toContain("승인하세요");
    expect(mocks.decisions).toHaveBeenCalledWith(mocks, expect.objectContaining({ queryText: "합성 테스트 질문", queryVector: [0.1], limit: 8, scope: "channel" }));
  });
  it("후속 질문은 SQL이 허용한 질문 맥락으로 원문을 다시 검색하며 이전 본문을 인용하지 않는다", async () => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: "answer-2", dept_id: "dept-1", asked_by: "lead-1", question: "그럼 담당자는 누구인가요?", parent_id: "answer-1", status: "pending" }, error: null }) };
    mocks.from.mockReturnValue(query);
    mocks.rpc.mockImplementation(async name => ({ data: name === "answer_conversation_context" ? [{ question: "계약 승인 기준은 무엇인가요?" }] : true, error: null }));
    await answerQuestion("answer-2");
    expect(mocks.rpc).toHaveBeenCalledWith("answer_conversation_context", { p_answer: "answer-2", p_scope: "user" });
    const input = JSON.parse(mocks.structured.mock.calls[0][2].user);
    expect(input.previous_questions).toEqual([{ question: "계약 승인 기준은 무엇인가요?" }]);
    expect(input.evidence[0].paragraphs).toEqual([{ paragraph: 1, text: "확인된 근거" }]);
    expect(mocks.search).toHaveBeenCalledWith(mocks, expect.objectContaining({ userId: "lead-1", deptId: "dept-1", scope: "user" }));
  });
  it("DM은 user 검색을 사용하고 내구성 전달은 생성 워커에서 직접 게시하지 않는다", async () => {
    await answerQuestion("answer-1", { channel: "D123", threadTs: "1.1", scope: "user", durable: true });
    expect(mocks.search).toHaveBeenCalledWith(mocks, expect.objectContaining({ scope: "user" }));
    expect(mocks.decisions).toHaveBeenCalledWith(mocks, expect.objectContaining({ scope: "user" }));
    expect(mocks.rpc).toHaveBeenCalledWith("complete_answer", expect.anything());
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.metadata).not.toHaveBeenCalled();
  });
  it("채널 목적지에 user scope를 넣어도 channel 범위로 제한한다", async () => {
    await answerQuestion("answer-1", { channel: "C123", threadTs: "1.1", scope: "user", durable: true });
    expect(mocks.search).toHaveBeenCalledWith(mocks, expect.objectContaining({ scope: "channel" }));
  });
  beforeEach(() => {
    vi.resetAllMocks();
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({
      data: {
        id: "answer-1",
        dept_id: "dept-1",
        asked_by: "lead-1",
        question: "합성 테스트 질문",
        status: "pending",
      },
      error: null,
    });
    const metadataQuery = {
      select: mocks.metadataSelect,
      eq: mocks.metadataDept,
      in: mocks.metadata,
      abortSignal: vi.fn(),
    };
    mocks.metadataSelect.mockReturnValue(metadataQuery);
    mocks.metadataDept.mockReturnValue(metadataQuery);
    mocks.metadata.mockReturnValue(metadataQuery);
    metadataQuery.abortSignal.mockImplementation(async () => ({
      data: [{ id: "item-1", external_ref: "1789431300.000000" }],
      error: null,
    }));
    mocks.from.mockImplementation((table: string) =>
      table === "items" ? metadataQuery : query,
    );
    mocks.search.mockResolvedValue([
      {
        id: "item-1",
        content: "확인된 근거",
        source_visibility: "dept",
        source_kind: "slack_channel",
        source_external_id: "C123",
        source_title: "#영업",
        author: "민서",
        spoken_at: "2026-09-15T00:15:00.000Z",
      },
    ]);
    mocks.permalink.mockResolvedValue(
      "https://example.slack.com/archives/C123/p1789431300000000",
    );
    mocks.decisions.mockResolvedValue([]);
    mocks.structured.mockResolvedValue({
      data: {
        citations: [
          { evidence: 1, first_paragraph: 1, last_paragraph: 1 },
        ],
        refused: false,
        refusal_reason: null,
      },
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  it("채널 응답은 팀장 질문도 두 검색 모두 channel 범위로 제한한다", async () => {
    await answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" });
    expect(mocks.search).toHaveBeenCalledWith(
      mocks,
      expect.objectContaining({ scope: "channel" }),
    );
    expect(mocks.decisions).toHaveBeenCalledWith(
      mocks,
      expect.objectContaining({ scope: "channel" }),
    );
  });

  it("웹 질문은 질문자 범위를 유지한다", async () => {
    await answerQuestion("answer-1");
    expect(mocks.search).toHaveBeenCalledWith(
      mocks,
      expect.objectContaining({ scope: "user", userId: "lead-1" }),
    );
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.metadataSelect).not.toHaveBeenCalled();
    expect(mocks.permalink).not.toHaveBeenCalled();
  });

  it("저장 성공 뒤 검증된 인용의 메타데이터와 원문 링크만 게시한다", async () => {
    await answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" });
    expect(mocks.metadataSelect).toHaveBeenCalledWith("id, external_ref");
    expect(mocks.metadataDept).toHaveBeenCalledWith("dept_id", "dept-1");
    expect(mocks.metadata).toHaveBeenCalledWith("id", ["item-1"]);
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.metadata.mock.invocationCallOrder[0],
    );
    expect(mocks.permalink).toHaveBeenCalledWith({
      channel: "C123",
      messageTs: "1789431300.000000",
    });
    const message = mocks.post.mock.calls[0][0];
    expect(message).toMatchObject({
      channel: "C_TEST",
      thread_ts: "1.1",
      mrkdwn: false,
    });
    for (const text of [
      answerLead(1),
      "확인된 근거",
      "민서",
      "2026. 9. 15.",
      "#영업",
      "example.slack.com",
      "이 채널에서 볼 수 있는 부서 기록만",
    ])
      expect(JSON.stringify(message.blocks)).toContain(text);
  });

  it("링크 조회 실패에도 인용을 유지하고 원문 화면을 제공한다", async () => {
    mocks.permalink.mockRejectedValue(new Error("unavailable"));
    await answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" });
    expect(mocks.post.mock.calls[0][0].text).toContain("확인된 근거");
    expect(mocks.post.mock.calls[0][0].text).toContain("원문 보기");
    expect(mocks.post.mock.calls[0][0].text).toContain("/d/dept-1/evidence/item-1?answer=answer-1");
  });

  it("메타데이터 조회 오류에도 저장된 답변과 인용을 게시한다", async () => {
    mocks.metadata.mockReturnValue({
      abortSignal: async () => ({ data: null, error: { code: "57014" } }),
    });
    await answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" });
    expect(mocks.post.mock.calls[0][0].text).toContain("확인된 근거");
    expect(mocks.post.mock.calls[0][0].text).toContain("원문 보기");
    expect(mocks.permalink).not.toHaveBeenCalled();
  });

  it("중복 출처 초안은 저장하지 않고 전체를 거절한다", async () => {
    const item = (await mocks.search())[0];
    mocks.search.mockResolvedValue([
      item,
      { ...item, id: "uncited", content: "인용하지 않은 본문" },
    ]);
    mocks.structured.mockResolvedValue({
      data: {
        answer: "확인한 답변",
        refused: false,
        citations: [
          { evidence: 1, first_paragraph: 1, last_paragraph: 1 },
          { evidence: 1, first_paragraph: 1, last_paragraph: 1 },
        ],
      },
    });
    await answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" });
    expect(mocks.metadata).not.toHaveBeenCalled();
    expect(mocks.permalink).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("complete_answer", expect.objectContaining({ p_refused: true, p_citations: [] }));
    expect(JSON.stringify(mocks.post.mock.calls)).not.toContain(
      "인용하지 않은 본문",
    );
  });

  it("검색됐어도 선택하지 않은 항목의 메타데이터와 원문은 추가 조회하지 않는다", async () => {
    const item = (await mocks.search())[0];
    mocks.search.mockResolvedValue([item, { ...item, id: "uncited", content: "선택하지 않은 원문" }]);
    await answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" });
    expect(mocks.metadata).toHaveBeenCalledWith("id", ["item-1"]);
    expect(mocks.permalink).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.post.mock.calls)).not.toContain("선택하지 않은 원문");
  });

  it("모델이 검색 밖 ID를 인용하면 해당 원문을 재조회하지 않고 거절한다", async () => {
    mocks.structured.mockResolvedValue({
      data: {
        answer: "숨겨진 내용",
        refused: false,
        citations: [
          { evidence: 999, first_paragraph: 1, last_paragraph: 1 },
        ],
      },
    });
    await answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" });
    expect(mocks.metadata).not.toHaveBeenCalled();
    expect(mocks.permalink).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.post.mock.calls)).not.toContain("숨겨진 내용");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "complete_answer",
      expect.objectContaining({ p_refused: true }),
    );
  });

  it("결정 인용은 검색된 결정자·시각·원장 링크를 사용한다", async () => {
    mocks.search.mockResolvedValue([]);
    mocks.decisions.mockResolvedValue([
      {
        id: "decision-1",
        outcome: "재입찰",
        rationale: "비용 원칙",
        decided_by_name: "수현",
        decided_at: "2026-09-15T00:15:00.000Z",
      },
    ]);
    mocks.structured.mockResolvedValue({
      data: {
        answer: "재입찰로 결정했습니다.",
        refused: false,
        citations: [
          { evidence: 1, first_paragraph: 1, last_paragraph: 1 },
        ],
      },
    });
    await answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" });
    const text = mocks.post.mock.calls[0][0].text;
    for (const part of [
      "비용 원칙",
      "수현",
      "2026. 9. 15.",
      "/d/dept-1/ledger#decision-decision-1",
    ])
      expect(text).toContain(part);
    expect(mocks.metadata).not.toHaveBeenCalled();
    expect(mocks.permalink).not.toHaveBeenCalled();
  });

  it("답변과 검증된 인용을 한 트랜잭션으로 저장한다", async () => {
    await answerQuestion("answer-1");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "complete_answer",
      expect.objectContaining({
        p_answer_id: "answer-1",
        p_refused: false,
        p_citations: [
          { item_id: "item-1", decision_id: null, quote: "확인된 근거" },
        ],
      }),
    );
  });

  it("인용 저장 실패는 재시도 가능한 오류로 남고 Slack에 게시하지 않는다", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    await expect(
      answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" }),
    ).rejects.toThrow("database operation failed");
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.metadata).not.toHaveBeenCalled();
    expect(mocks.permalink).not.toHaveBeenCalled();
  });

  it("스윕이 먼저 종료한 답변은 Slack에 늦게 게시하지 않는다", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" });
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.metadata).not.toHaveBeenCalled();
    expect(mocks.permalink).not.toHaveBeenCalled();
  });

  it("일부 인용만 유효한 초안은 재생성 후에도 실패하면 전체 거절한다", async () => {
    mocks.structured.mockResolvedValue({
      data: {
        answer: "확인된 근거와 근거 없는 추가 주장",
        refused: false,
        citations: [
          { evidence: 1, first_paragraph: 1, last_paragraph: 1 },
          { evidence: 1, first_paragraph: 1, last_paragraph: 2 },
        ],
      },
    });
    await answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" });
    expect(mocks.structured).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "complete_answer",
      expect.objectContaining({
        p_refused: true,
        p_citations: [],
        p_error_code: "citation_invalid",
      }),
    );
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("추가 주장");
    expect(JSON.stringify(mocks.post.mock.calls)).not.toContain("추가 주장");
  });

  it("첫 초안이 잘못되어도 두 번째 인용 전체가 유효하면 두 번째 답변만 게시한다", async () => {
    mocks.structured.mockResolvedValueOnce({
      data: { answer: "잘못된 초안", refused: false, citations: [] },
    });
    await answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" });
    expect(mocks.structured).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "complete_answer",
      expect.objectContaining({
        p_refused: false,
        p_answer: answerLead(1),
      }),
    );
    expect(JSON.stringify(mocks.post.mock.calls)).not.toContain("잘못된 초안");
  });

  it("모델이 refused이면 자유 서술 초안을 게시하지 않는다", async () => {
    mocks.structured.mockResolvedValue({
      data: { answer: "검증되지 않은 거절 이유", refused: true, citations: [] },
    });
    await answerQuestion("answer-1", { channel: "C_TEST", threadTs: "1.1" });
    expect(mocks.structured).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("검증되지 않은");
    expect(JSON.stringify(mocks.post.mock.calls)).not.toContain(
      "검증되지 않은",
    );
  });

  it("실제 게이트웨이의 llm_refusal 오류도 failed가 아니라 refused로 종료한다", async () => {
    mocks.structured.mockRejectedValue({ error_code: "llm_refusal" });
    await answerQuestion("answer-1");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "complete_answer",
      expect.objectContaining({ p_refused: true, p_citations: [] }),
    );
  });

  it("실제 스키마 오류는 근거 부족으로 숨기지 않는다", async () => {
    mocks.structured.mockRejectedValue({ error_code: "schema_invalid" });
    await expect(answerQuestion("answer-1")).rejects.toMatchObject({ error_code: "schema_invalid" });
    expect(mocks.structured).toHaveBeenCalledOnce();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("네트워크 오류를 근거 부족으로 숨기지 않는다", async () => {
    mocks.structured.mockRejectedValue(new Error("network unavailable"));
    await expect(answerQuestion("answer-1")).rejects.toThrow(
      "network unavailable",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
