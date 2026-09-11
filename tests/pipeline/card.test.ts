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
  makeCard,
  narrowestVisibility,
  registerMakeCardHandler,
  resolveAssignee,
  verifyCitations,
} from "@/lib/pipeline/card";

type Visibility = "dept" | "leads_only";
type Row = Record<string, unknown>;

const originItem = {
  id: "item-origin",
  source_id: "source-public",
  dept_id: "dept-1",
  content: "외주사 B 견적을 받아도 될까요?",
  deleted_at: null,
  created_at: "2026-09-08T03:00:00.000Z",
  source: { visibility: "dept" satisfies Visibility },
};

const defaultDraft = {
  citations: [
    {
      item_id: originItem.id,
      decision_id: null,
      quote: "외주사 B 견적을 받아도 될까요?",
    },
  ],
  title: "외주사 B 견적 결정",
  background: "견적 수락 여부를 결정해야 합니다.",
  deadline: null,
  assignee_hint: "김팀원",
  recommendation: "재입찰 여부를 검토합니다.",
  conflicts: [],
};

type FakeOptions = {
  origin?: typeof originItem | null;
  sameSourceItems?: Row[];
  principleSources?: Row[];
  principleItems?: Row[];
  decisions?: Row[];
  decisionRequests?: Row[];
  members?: Row[];
  raceOnFirstInsert?: boolean;
};

function createFakeClient(options: FakeOptions = {}) {
  const state = {
    origin: options.origin === undefined ? originItem : options.origin,
    sameSourceItems:
      options.sameSourceItems ?? [
        originItem,
        {
          id: "item-context",
          source_id: "source-public",
          dept_id: "dept-1",
          content: "재무팀 회신은 오늘 예정입니다.",
          deleted_at: null,
          created_at: "2026-09-08T02:00:00.000Z",
        },
      ],
    principleSources:
      options.principleSources ?? [
        {
          id: "source-principles",
          visibility: "leads_only" satisfies Visibility,
        },
      ],
    principleItems:
      options.principleItems ?? [
        {
          id: "item-principle",
          source_id: "source-principles",
          content: "연 10% 이상 인상 시 재입찰한다.",
          deleted_at: null,
          created_at: "2026-09-07T03:00:00.000Z",
        },
      ],
    decisions:
      options.decisions ?? [
        {
          id: "decision-real",
          request_id: "request-prior",
          outcome: "연 10% 이상이면 재입찰",
          rationale: "원가 원칙을 따른다.",
          decided_at: "2026-09-01T03:00:00.000Z",
        },
      ],
    decisionRequests:
      options.decisionRequests ?? [
        { id: "request-prior", visibility: "leads_only" satisfies Visibility },
      ],
    members:
      options.members ?? [
        { user_id: "lead-1", display_name: "김팀장", role: "lead" },
        { user_id: "member-1", display_name: "김팀원", role: "member" },
      ],
    cards: [] as Row[],
    citations: [] as Row[],
    conflicts: [] as Row[],
    raceOnFirstInsert: options.raceOnFirstInsert ?? false,
    insertAttempts: 0,
  };

  class QueryBuilder implements PromiseLike<{ data: unknown; error: unknown }> {
    private action: "select" | "insert" | "update" = "select";
    private inserted: Row | Row[] | null = null;
    private updated: Row | null = null;
    private filters = new Map<string, unknown>();
    private inFilters = new Map<string, unknown[]>();

    constructor(private readonly table: string) {}

    select() {
      return this;
    }

    insert(values: Row | Row[]) {
      this.action = "insert";
      this.inserted = values;
      return this;
    }

    update(values: Row) {
      this.action = "update";
      this.updated = values;
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.set(column, value);
      return this;
    }

    is(column: string, value: unknown) {
      this.filters.set(column, value);
      return this;
    }

    in(column: string, values: unknown[]) {
      this.inFilters.set(column, values);
      return this;
    }

    order() {
      return this;
    }

    limit() {
      return this;
    }

    maybeSingle() {
      const result = this.execute();
      const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
      return Promise.resolve({ ...result, data });
    }

    single() {
      const result = this.execute();
      const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
      return Promise.resolve({ ...result, data });
    }

    then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
      onfulfilled?:
        | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
    }

    private execute(): { data: unknown; error: unknown } {
      if (this.action === "update") {
        if (this.table === "decision_requests") {
          const card = state.cards.find((candidate) => candidate.id === this.filters.get("id"));
          if (card && this.updated) Object.assign(card, this.updated);
          return { data: null, error: null };
        }
        throw new Error(`unexpected update table: ${this.table}`);
      }

      if (this.action === "insert") {
        return this.executeInsert();
      }

      if (this.table === "items" && this.filters.has("id")) {
        return { data: state.origin, error: null };
      }

      if (this.table === "items" && this.inFilters.has("source_id")) {
        return { data: state.principleItems, error: null };
      }

      if (this.table === "items") {
        return { data: state.sameSourceItems, error: null };
      }

      if (this.table === "sources") {
        return { data: state.principleSources, error: null };
      }

      if (this.table === "decisions") {
        return { data: state.decisions, error: null };
      }

      if (this.table === "decision_requests") {
        if (this.filters.has("origin_item_id")) {
          const existing = state.cards.find(
            (card) =>
              card.origin_item_id === this.filters.get("origin_item_id") &&
              card.status === this.filters.get("status"),
          );
          return { data: existing ?? null, error: null };
        }

        const ids = this.inFilters.get("id");
        return {
          data: ids
            ? state.decisionRequests.filter((request) => ids.includes(request.id))
            : state.decisionRequests,
          error: null,
        };
      }

      if (this.table === "members") {
        return { data: state.members, error: null };
      }

      throw new Error(`unexpected select table: ${this.table}`);
    }

    private executeInsert(): { data: unknown; error: unknown } {
      const rows = Array.isArray(this.inserted) ? this.inserted : [this.inserted];
      const presentRows = rows.filter((row): row is Row => row !== null);

      if (this.table === "decision_requests") {
        state.insertAttempts += 1;
        if (state.raceOnFirstInsert && state.insertAttempts === 1) {
          state.cards.push({
            id: "card-race-winner",
            origin_item_id: originItem.id,
            status: "open",
          });
          return { data: null, error: { code: "23505" } };
        }

        const card = { id: `card-${state.cards.length + 1}`, ...presentRows[0] };
        state.cards.push(card);
        return { data: card, error: null };
      }

      if (this.table === "citations") {
        state.citations.push(...presentRows);
        return { data: null, error: null };
      }

      if (this.table === "conflicts") {
        state.conflicts.push(...presentRows);
        return { data: null, error: null };
      }

      throw new Error(`unexpected insert table: ${this.table}`);
    }
  }

  return {
    client: { from: vi.fn((table: string) => new QueryBuilder(table)) },
    state,
  };
}

function resolveDrafts(...drafts: Row[]) {
  for (const draft of drafts) {
    moduleMocks.llmStructured.mockResolvedValueOnce({
      data: draft,
      meta: {
        model: "openai/gpt-oss-120b",
        inputTokens: 100,
        outputTokens: 50,
        durationMs: 30,
      },
    });
  }
}

describe("card pipeline pure rules", () => {
  it("quote 가 원문에 없으면 그 인용을 제거한다", () => {
    const citations = [
      { itemId: "item-1", quote: "있는 문장" },
      { decisionId: "decision-1", quote: "없는 문장" },
    ];
    const sources = new Map([
      ["item-1", "여기에 있는 문장입니다."],
      ["decision-1", "다른 결정 원문입니다."],
    ]);

    expect(verifyCitations(citations, sources)).toEqual({
      valid: [{ itemId: "item-1", quote: "있는 문장" }],
      dropped: 1,
    });
  });

  it("narrowestVisibility 는 [dept, leads_only] 에 leads_only 를 준다", () => {
    expect(narrowestVisibility(["dept", "leads_only"])).toBe("leads_only");
    expect(narrowestVisibility(["dept", "dept"])).toBe("dept");
  });

  it("visibility=leads_only 카드의 담당자는 assignee_hint 와 무관하게 lead 다", () => {
    expect(
      resolveAssignee({
        assigneeHint: "김팀원",
        members: [
          { userId: "lead-1", displayName: "김팀장", role: "lead" },
          { userId: "member-1", displayName: "김팀원", role: "member" },
        ],
        visibility: "leads_only",
      }),
    ).toBe("lead-1");
  });
});

describe("makeCard", () => {
  beforeEach(() => {
    moduleMocks.createServiceSupabaseClient.mockReset();
    moduleMocks.enqueue.mockReset();
    moduleMocks.llmStructured.mockReset();
    moduleMocks.registerHandler.mockReset();
  });

  it("인용이 전부 제거되면 1회 재생성한다", async () => {
    const fake = createFakeClient();
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    resolveDrafts(
      {
        ...defaultDraft,
        citations: [
          { item_id: originItem.id, decision_id: null, quote: "없는 문장" },
        ],
      },
      defaultDraft,
    );

    await makeCard(originItem.id);

    expect(moduleMocks.llmStructured).toHaveBeenCalledTimes(2);
    expect(fake.state.cards).toHaveLength(1);
    expect(fake.state.cards[0]).toMatchObject({ status: "open" });
    expect(fake.state.citations).toEqual([
      expect.objectContaining({
        owner_kind: "decision_request",
        owner_id: "card-1",
        item_id: originItem.id,
        quote: "외주사 B 견적을 받아도 될까요?",
      }),
    ]);
  });

  it("재생성 후에도 인용이 0개면 status=needs_review 로 저장하고 send_slack 을 enqueue 하지 않는다", async () => {
    const fake = createFakeClient();
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    const invalidDraft = {
      ...defaultDraft,
      citations: [
        { item_id: originItem.id, decision_id: null, quote: "없는 문장" },
      ],
    };
    resolveDrafts(invalidDraft, invalidDraft);

    await makeCard(originItem.id);

    expect(moduleMocks.llmStructured).toHaveBeenCalledTimes(2);
    expect(fake.state.cards).toEqual([
      expect.objectContaining({
        origin_item_id: originItem.id,
        status: "needs_review",
      }),
    ]);
    expect(fake.state.citations).toHaveLength(0);
    expect(moduleMocks.enqueue).not.toHaveBeenCalledWith(
      "send_slack",
      expect.anything(),
    );
  });

  it("실존하지 않는 prior_decision_id 를 가진 conflict 는 저장하지 않는다", async () => {
    const fake = createFakeClient();
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    resolveDrafts({
      ...defaultDraft,
      conflicts: [
        { decision_id: "decision-real", explanation: "원칙과 충돌합니다." },
        { decision_id: "decision-missing", explanation: "없는 결정입니다." },
      ],
    });

    await makeCard(originItem.id);

    expect(fake.state.conflicts).toEqual([
      {
        request_id: "card-1",
        prior_decision_id: "decision-real",
        explanation: "원칙과 충돌합니다.",
        confirmed: false,
      },
    ]);
  });

  it("같은 origin_item_id 로 두 번 승격하면 카드가 1장이다", async () => {
    const fake = createFakeClient();
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    resolveDrafts(defaultDraft);

    await makeCard(originItem.id);
    await makeCard(originItem.id);

    expect(fake.state.cards).toHaveLength(1);
    expect(moduleMocks.llmStructured).toHaveBeenCalledOnce();
  });

  it("partial unique 경합도 기존 open 카드를 성공 경로로 처리한다", async () => {
    const fake = createFakeClient({ raceOnFirstInsert: true });
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    resolveDrafts(defaultDraft);

    await expect(makeCard(originItem.id)).resolves.toBeUndefined();

    expect(fake.state.cards).toHaveLength(1);
    expect(fake.state.cards[0]).toMatchObject({ id: "card-race-winner" });
    expect(fake.state.citations).toHaveLength(0);
  });

  it("same source 최근 항목·원칙 문서·최근 결정 3건을 생성 입력에 넣는다", async () => {
    const fake = createFakeClient();
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    resolveDrafts(defaultDraft);

    await makeCard(originItem.id);

    expect(moduleMocks.llmStructured).toHaveBeenCalledWith(
      "make_card",
      expect.anything(),
      expect.objectContaining({
        system: expect.stringContaining("먼저 citations를 채우고"),
        user: expect.stringMatching(
          /item-origin[\s\S]*item-context[\s\S]*item-principle[\s\S]*decision-real/,
        ),
      }),
      { deptId: "dept-1" },
    );
  });

  it("검증된 open 카드의 send_slack job을 멱등 enqueue 한다", async () => {
    const fake = createFakeClient();
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    resolveDrafts(defaultDraft);

    await makeCard(originItem.id);

    expect(moduleMocks.enqueue).toHaveBeenCalledWith(
      "send_slack",
      { requestId: "card-1" },
      { dedupeKey: "card-1" },
    );
  });

  it("LLM이 과거 결정만 인용해도 원본 항목을 카드 근거에 포함한다", async () => {
    const fake = createFakeClient();
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    resolveDrafts({
      ...defaultDraft,
      citations: [
        {
          item_id: null,
          decision_id: "decision-real",
          quote: "연 10% 이상이면 재입찰",
        },
      ],
    });

    await makeCard(originItem.id);

    expect(fake.state.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          item_id: originItem.id,
          quote: originItem.content,
        }),
        expect.objectContaining({
          decision_id: "decision-real",
          quote: "연 10% 이상이면 재입찰",
        }),
      ]),
    );
  });

  it("원본 항목을 부분 인용해도 카드에는 전체 원문을 표시한다", async () => {
    const fake = createFakeClient();
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    resolveDrafts({
      ...defaultDraft,
      citations: [
        {
          item_id: originItem.id,
          decision_id: null,
          quote: "외주사 B 견적을 받아도",
        },
      ],
    });

    await makeCard(originItem.id);

    expect(fake.state.citations).toEqual([
      expect.objectContaining({
        item_id: originItem.id,
        quote: originItem.content,
      }),
    ]);
  });

  it("make_card handler 를 등록하고 payload itemId 로 makeCard 를 실행한다", async () => {
    const fake = createFakeClient();
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    resolveDrafts(defaultDraft);

    registerMakeCardHandler();

    expect(moduleMocks.registerHandler).toHaveBeenCalledWith(
      "make_card",
      expect.any(Function),
    );
    const handler = moduleMocks.registerHandler.mock.calls[0][1] as (payload: {
      itemId: string;
    }) => Promise<void>;
    await handler({ itemId: originItem.id });
    expect(fake.state.cards).toHaveLength(1);
  });
});
