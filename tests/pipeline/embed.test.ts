import { beforeEach, describe, expect, it, vi } from "vitest";

const moduleMocks = vi.hoisted(() => ({
  createServiceSupabaseClient: vi.fn(),
  embedText: vi.fn(),
  registerHandler: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: moduleMocks.createServiceSupabaseClient,
}));
vi.mock("@/lib/embeddings", () => ({
  embedText: moduleMocks.embedText,
  formatVector: (vector: number[]) => `[${vector.join(",")}]`,
}));
vi.mock("@/lib/jobs", () => ({
  registerHandler: moduleMocks.registerHandler,
}));

import { embedItem, registerEmbedHandler } from "@/lib/pipeline/embed";

function makeBuilder(data: unknown, error: unknown = null) {
  const builder = Promise.resolve({ data, error }) as Promise<unknown> & Record<string, (...args: unknown[]) => unknown>;
  builder.eq = () => builder;
  builder.select = () => builder;
  builder.maybeSingle = () => builder;
  return builder;
}

function createClient() {
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
  return { client: { from }, updates };
}

describe("embed pipeline", () => {
  beforeEach(() => {
    moduleMocks.createServiceSupabaseClient.mockReset();
    moduleMocks.embedText.mockReset();
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

  it("embed handler를 등록한다", () => {
    registerEmbedHandler();
    expect(moduleMocks.registerHandler).toHaveBeenCalledWith(
      "embed",
      expect.any(Function),
    );
  });
});
