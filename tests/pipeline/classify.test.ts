import { beforeEach, describe, expect, it, vi } from "vitest";

const moduleMocks = vi.hoisted(() => ({
  createServiceSupabaseClient: vi.fn(),
  enqueue: vi.fn(),
  llmStructured: vi.fn(),
  registerHandler: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: moduleMocks.createServiceSupabaseClient,
}));
vi.mock("@/lib/llm", () => ({
  llm: { structured: moduleMocks.llmStructured },
}));
vi.mock("@/lib/jobs", () => ({
  enqueue: moduleMocks.enqueue,
  registerHandler: moduleMocks.registerHandler,
}));

import {
  classifyItem,
  registerClassifyHandler,
} from "@/lib/pipeline/classify";

type ItemRow = {
  id: string;
  content: string;
  spoken_at: string | null;
  created_at: string;
  deleted_at: string | null;
  dept_id: string;
};

const baseItem: ItemRow = {
  id: "item-1",
  content: "이 안으로 진행해도 돼요?",
  spoken_at: "2026-09-08T03:00:00.000Z",
  created_at: "2026-09-08T03:00:01.000Z",
  deleted_at: null,
  dept_id: "dept-1",
};

function classification(overrides: Record<string, unknown> = {}) {
  return {
    label: "decision",
    confidence: 0.8,
    deadline_hint: null,
    assignee_hint: null,
    reasoning: "결정 요청입니다.",
    ...overrides,
  };
}

function createFakeClient(item: ItemRow | null) {
  const classificationUpsert = vi.fn(async () => ({ data: null, error: null }));
  const itemLookup = {
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: item, error: null })),
  };
  itemLookup.eq.mockReturnValue(itemLookup);

  const client = {
    from: vi.fn((table: string) => {
      if (table === "items") {
        return { select: vi.fn(() => itemLookup) };
      }

      if (table === "classifications") {
        return { upsert: classificationUpsert };
      }

      throw new Error(`unexpected table: ${table}`);
    }),
  };

  return { client, classificationUpsert };
}

function useItem(item: ItemRow | null = baseItem) {
  const fake = createFakeClient(item);
  moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
  return fake;
}

function resolveLlm(overrides: Record<string, unknown> = {}) {
  moduleMocks.llmStructured.mockResolvedValue({
    data: classification(overrides),
    meta: {
      model: "openai/gpt-oss-20b",
      inputTokens: 10,
      outputTokens: 5,
      durationMs: 20,
    },
  });
}

describe("classify pipeline", () => {
  beforeEach(() => {
    moduleMocks.createServiceSupabaseClient.mockReset();
    moduleMocks.enqueue.mockReset();
    moduleMocks.llmStructured.mockReset();
    moduleMocks.registerHandler.mockReset();
  });

  it("규칙 비후보 실행 요청도 모델로 검토하고 action으로 저장한다", async () => {
    const fake = useItem({ ...baseItem, content: "다음 주까지 QA 업체 견적을 받아 주세요." });
    resolveLlm({ label: "action" });

    await classifyItem(baseItem.id);

    expect(moduleMocks.llmStructured).toHaveBeenCalledOnce();
    expect(fake.classificationUpsert).toHaveBeenCalledWith(expect.objectContaining({
      item_id: baseItem.id,
      label: "action",
      method: "llm",
    }));
    expect(moduleMocks.enqueue).toHaveBeenCalledWith(
      "embed",
      { itemId: baseItem.id },
      { dedupeKey: baseItem.id },
    );
  });

  it("결정 후보가 아닌 현황 공유는 info로 저장한다", async () => {
    const fake = useItem({ ...baseItem, content: "배포가 완료되었습니다." });
    resolveLlm({ label: "info" });

    await classifyItem(baseItem.id);

    expect(fake.classificationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ label: "info", method: "llm" }),
    );
  });

  it("일상 대화는 chatter로 저장한다", async () => {
    const fake = useItem({ ...baseItem, content: "오늘 점심은 김치찌개 어때요?" });
    resolveLlm({ label: "chatter" });

    await classifyItem(baseItem.id);

    expect(fake.classificationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ label: "chatter", method: "llm" }),
    );
  });

  it("규칙이 잡으면 llm.structured 를 정확히 1회 호출한다", async () => {
    useItem();
    resolveLlm();

    await classifyItem(baseItem.id);

    expect(moduleMocks.llmStructured).toHaveBeenCalledOnce();
    expect(moduleMocks.llmStructured).toHaveBeenCalledWith(
      "classify",
      expect.anything(),
      expect.objectContaining({
        system: expect.any(String),
        user: expect.stringContaining("question_request"),
      }),
      { deptId: "dept-1" },
    );
  });

  it("confidence 0.5 는 make_card 를 enqueue 하지 않는다", async () => {
    useItem();
    resolveLlm({ confidence: 0.5 });

    await classifyItem(baseItem.id);

    expect(moduleMocks.enqueue).not.toHaveBeenCalledWith(
      "make_card",
      expect.anything(),
    );
  });

  it("label=decision & confidence 0.8 은 make_card 를 enqueue 한다", async () => {
    useItem();
    resolveLlm({ label: "decision", confidence: 0.8 });

    await classifyItem(baseItem.id);

    expect(moduleMocks.enqueue).toHaveBeenCalledTimes(2);
    expect(moduleMocks.enqueue).toHaveBeenCalledWith("make_card", {
      itemId: baseItem.id,
    });
  });

  it("규칙이 결정 후보로 잡고 llm이 decision을 반환하면 confidence null이어도 승격한다", async () => {
    useItem();
    resolveLlm({ label: "decision", confidence: null });

    await classifyItem(baseItem.id);

    expect(moduleMocks.enqueue).toHaveBeenCalledWith("make_card", {
      itemId: baseItem.id,
    });
  });

  it("LLM 실패 시 label=unclassified 로 저장하고 항목을 버리지 않는다", async () => {
    const fake = useItem();
    moduleMocks.llmStructured.mockRejectedValue(new Error("Groq unavailable"));

    await expect(classifyItem(baseItem.id)).resolves.toBeUndefined();

    expect(fake.classificationUpsert).toHaveBeenCalledWith({
      item_id: baseItem.id,
      label: "unclassified",
      method: "llm",
      confidence: null,
      deadline_hint: null,
      assignee_hint: null,
      reasoning: null,
    });
  });

  it("분류 성공 시 embed job을 멱등 enqueue 한다", async () => {
    useItem();
    resolveLlm();

    await classifyItem(baseItem.id);

    expect(moduleMocks.enqueue).toHaveBeenCalledWith(
      "embed",
      { itemId: baseItem.id },
      { dedupeKey: baseItem.id },
    );
  });

  it("4,000자 초과 본문은 앞 4,000자만 LLM 에 보낸다", async () => {
    const content = `확인 부탁드립니다. ${"가".repeat(4_100)}`;
    useItem({ ...baseItem, content });
    resolveLlm();

    await classifyItem(baseItem.id);

    const prompt = moduleMocks.llmStructured.mock.calls[0][2] as {
      user: string;
    };
    const input = JSON.parse(prompt.user) as { content: string };
    expect(input.content).toBe(content.slice(0, 4_000));
    expect(prompt.user).not.toContain("4,000");
  });

  it("deadline_hint 는 규칙 값이 LLM 값보다 우선한다", async () => {
    const fake = useItem({
      ...baseItem,
      content: "금요일까지 확인 부탁드립니다.",
    });
    resolveLlm({ deadline_hint: "2026-09-30T14:59:59.999Z" });

    await classifyItem(baseItem.id);

    expect(fake.classificationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        deadline_hint: "2026-09-11T14:59:59.999Z",
      }),
    );
  });

  it("항목이 없거나 삭제되었으면 조용히 종료한다", async () => {
    useItem(null);
    await expect(classifyItem("missing-item")).resolves.toBeUndefined();

    useItem({
      ...baseItem,
      deleted_at: "2026-09-08T04:00:00.000Z",
    });
    await expect(classifyItem(baseItem.id)).resolves.toBeUndefined();

    expect(moduleMocks.llmStructured).not.toHaveBeenCalled();
    expect(moduleMocks.enqueue).not.toHaveBeenCalled();
  });

  it("classify handler 를 등록하고 payload itemId 로 classifyItem 을 실행한다", async () => {
    const fake = useItem({ ...baseItem, content: "배포가 완료되었습니다." });
    resolveLlm({ label: "info" });

    registerClassifyHandler();

    expect(moduleMocks.registerHandler).toHaveBeenCalledOnce();
    expect(moduleMocks.registerHandler).toHaveBeenCalledWith(
      "classify",
      expect.any(Function),
    );
    const handler = moduleMocks.registerHandler.mock.calls[0][1] as (payload: {
      itemId: string;
    }) => Promise<void>;
    await handler({ itemId: baseItem.id });
    expect(fake.classificationUpsert).toHaveBeenCalledOnce();
  });

  it.each([
    { confidence: 0.6, promoted: true },
    { confidence: 0.59, promoted: false },
    { confidence: null, promoted: false },
  ])("규칙 비후보의 decision confidence=$confidence 승격=$promoted", async ({ confidence, promoted }) => {
    const fake = useItem({ ...baseItem, content: "두 대안 중 어느 쪽을 선택해야 하나요." });
    resolveLlm({ confidence });
    await classifyItem(baseItem.id);
    expect(moduleMocks.llmStructured).toHaveBeenCalledOnce();
    const prompt = moduleMocks.llmStructured.mock.calls[0][2] as { user: string };
    expect(JSON.parse(prompt.user).ruleReasons).toEqual([]);
    expect(fake.classificationUpsert).toHaveBeenCalledWith(expect.objectContaining({ label: "decision", confidence }));
    expect(moduleMocks.enqueue.mock.calls.some(([kind]) => kind === "make_card")).toBe(promoted);
  });

  it.each(["action", "info", "chatter"])("비결정 %s는 높은 confidence여도 승격하지 않는다", async label => {
    useItem();
    resolveLlm({ label, confidence: 1 });
    await classifyItem(baseItem.id);
    expect(moduleMocks.enqueue.mock.calls.some(([kind]) => kind === "make_card")).toBe(false);
  });

  it("규칙 비후보의 모델 실패도 unclassified로 보존하고 카드 생성하지 않는다", async () => {
    const fake = useItem({ ...baseItem, content: "대안 선택이 필요합니다." });
    moduleMocks.llmStructured.mockRejectedValue(new Error("unavailable"));
    await classifyItem(baseItem.id);
    expect(fake.classificationUpsert).toHaveBeenCalledWith(expect.objectContaining({ label: "unclassified" }));
    expect(moduleMocks.enqueue.mock.calls.some(([kind]) => kind === "make_card")).toBe(false);
  });

  it.each(["", " \t\n"])("빈 본문 %j는 모델/큐/분류 쓰기 없이 종료한다", async content => {
    const fake = useItem({ ...baseItem, content });
    await classifyItem(baseItem.id);
    expect(moduleMocks.llmStructured).not.toHaveBeenCalled();
    expect(moduleMocks.enqueue).not.toHaveBeenCalled();
    expect(fake.classificationUpsert).not.toHaveBeenCalled();
  });
});
