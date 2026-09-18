import { beforeEach, describe, expect, it, vi } from "vitest";

const moduleMocks = vi.hoisted(() => ({
  createServiceSupabaseClient: vi.fn(),
  embedText: vi.fn(),
  embedTexts: vi.fn(),
  registerHandler: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: moduleMocks.createServiceSupabaseClient,
}));
vi.mock("@/lib/embeddings", () => ({
  embedText: moduleMocks.embedText,
  embedTexts: moduleMocks.embedTexts,
  formatVector: (vector: number[]) => `[${vector.join(",")}]`,
}));
vi.mock("@/lib/jobs", () => ({
  registerHandler: moduleMocks.registerHandler,
}));

import { embedBatch, embedDecision, embedItem, registerEmbedHandler } from "@/lib/pipeline/embed";

function makeBuilder(data: unknown, error: unknown = null) {
  const builder = Promise.resolve({ data, error }) as Promise<unknown> & Record<string, (...args: unknown[]) => unknown>;
  builder.eq = () => builder;
  builder.select = () => builder;
  builder.maybeSingle = () => builder;
  return builder;
}

function createClient(itemOverrides: Partial<{
  id: string;
  content: string;
  deleted_at: string | null;
  sources: {
    import_version: number;
    title: string | null;
  };
}> = {}) {
  const updates: Record<string, unknown>[] = [];
  const from = vi.fn((table: string) => {
    if (table === "items") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => makeBuilder({
              id: "item-1",
              content: "외주사 견적을 확인합니다.",
              deleted_at: null,
              content_version: 1,
              sources: { import_version: 1, title: "외주 검토" },
              ...itemOverrides,
            }),
          }),
        }),
        update: (values: Record<string, unknown>) => {
          updates.push(values);
          return makeBuilder(null);
        },
      };
    }
    if (table === "decisions") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => makeBuilder({
              id: "decision-1",
              outcome: "재입찰한다.",
              rationale: "원칙에 따른다.",
            }),
          }),
        }),
        update: (values: Record<string, unknown>) => {
          updates.push(values);
          return makeBuilder(null);
        },
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  const rpc = vi.fn(async (_name: string, args: { p_embedding: string; p_model: string }) => {
    updates.push({ embedding: args.p_embedding, embed_model: args.p_model, embed_status: "done" });
    return { data: true, error: null };
  });
  return { client: { from, rpc }, updates };
}

describe("embed pipeline", () => {
  beforeEach(() => {
    moduleMocks.createServiceSupabaseClient.mockReset();
    moduleMocks.embedText.mockReset();
    moduleMocks.embedTexts.mockReset();
    moduleMocks.registerHandler.mockReset();
  });

  it("item content를 임베딩하고 모델·상태를 저장한다", async () => {
    const fake = createClient();
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    moduleMocks.embedText.mockResolvedValue({
      vector: [0.1, 0.2],
      model: "text-embedding-3-small",
      inputTokens: 5,
    });

    await embedItem("item-1");

    expect(moduleMocks.embedText).toHaveBeenCalledWith(
      "외주사 견적을 확인합니다.",
      { inputType: "document" },
    );
    expect(fake.updates).toEqual([
      {
        embedding: "[0.1,0.2]",
        embed_model: "text-embedding-3-small",
        embed_status: "done",
      },
    ]);
  });

  it("삭제된 item은 임베딩 호출과 후속 update 없이 종료한다", async () => {
    const fake = createClient({
      content: "삭제 전에 저장됐던 본문",
      deleted_at: "2026-09-13T07:00:00.000Z",
    });
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);

    await embedItem("item-1");

    expect(moduleMocks.embedText).not.toHaveBeenCalled();
    expect(fake.updates).toEqual([]);
  });

  it("v2 item은 마스킹한 소스 제목을 임베딩 입력에만 붙인다", async () => {
    const fake = createClient({
      sources: {
        import_version: 2,
        title: "담당자 person@example.com 운영 원칙",
      },
    });
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    moduleMocks.embedText.mockResolvedValue({
      vector: [0.1, 0.2],
      model: "voyage-4-lite",
      inputTokens: 10,
    });

    await embedItem("item-1");

    expect(moduleMocks.embedText).toHaveBeenCalledWith(
      "담당자 [이메일] 운영 원칙\n외주사 견적을 확인합니다.",
      { inputType: "document" },
    );
  });

  it("embed handler를 등록한다", () => {
    registerEmbedHandler();
    expect(moduleMocks.registerHandler).toHaveBeenCalledWith(
      "embed",
      expect.any(Function),
    );
    expect(moduleMocks.registerHandler).toHaveBeenCalledWith(
      "embed_decision",
      expect.any(Function),
    );
    expect(moduleMocks.registerHandler).toHaveBeenCalledWith(
      "embed_batch",
      expect.any(Function),
    );
  });

  it("부서의 v2 pending item을 한 번에 임베딩하고 stale item만 pending으로 남긴다", async () => {
    const rows = [
      {
        id: "item-stale",
        dept_id: "dept-1",
        content: "변경 전 본문",
        content_version: 1,
        deleted_at: null,
        sources: { import_version: 2, title: "담당자 stale@example.com" },
      },
      {
        id: "item-current",
        dept_id: "dept-1",
        content: "현재 본문",
        content_version: 2,
        deleted_at: null,
        sources: { import_version: 2, title: "운영 원칙" },
      },
    ];
    let selectCount = 0;
    const query = (data: unknown) => {
      const builder = Promise.resolve({ data, error: null }) as Promise<unknown> & Record<string, (...args: unknown[]) => unknown>;
      for (const method of ["eq", "is", "order", "limit"]) builder[method] = () => builder;
      return builder;
    };
    const rpc = vi.fn(async (_name: string, args: { p_item: string }) => ({
      data: args.p_item !== "item-stale",
      error: null,
    }));
    const client = {
      from: vi.fn(() => ({
        select: () => query(selectCount++ === 0 ? rows : [{ id: "item-stale" }]),
      })),
      rpc,
    };
    moduleMocks.createServiceSupabaseClient.mockReturnValue(client);
    moduleMocks.embedTexts.mockResolvedValue({
      vectors: [[0.1, 0.2], [0.3, 0.4]],
      model: "voyage-4-lite",
      inputTokens: 20,
    });

    await expect(embedBatch("dept-1")).resolves.toEqual({ requeue: true });
    expect(moduleMocks.embedTexts).toHaveBeenCalledOnce();
    expect(moduleMocks.embedTexts).toHaveBeenCalledWith([
      "담당자 [이메일]\n변경 전 본문",
      "운영 원칙\n현재 본문",
    ], "document");
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith("complete_item_embedding", expect.objectContaining({
      p_item: "item-stale",
      p_version: 1,
      p_embedding: "[0.1,0.2]",
    }));
    expect(rpc).toHaveBeenCalledWith("complete_item_embedding", expect.objectContaining({
      p_item: "item-current",
      p_version: 2,
      p_embedding: "[0.3,0.4]",
    }));
  });

  it("결정 결과와 사유를 하나의 문서 임베딩으로 저장한다", async () => {
    const fake = createClient();
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    moduleMocks.embedText.mockResolvedValue({
      vector: [0.3, 0.4],
      model: "voyage-4-lite",
      inputTokens: 5,
    });

    await embedDecision("decision-1");

    expect(moduleMocks.embedText).toHaveBeenCalledWith(
      "재입찰한다.\n원칙에 따른다.",
      { inputType: "document" },
    );
    expect(fake.updates).toContainEqual({
      embedding: "[0.3,0.4]",
      embed_model: "voyage-4-lite",
    });
  });
});
