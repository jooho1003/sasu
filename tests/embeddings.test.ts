import { afterEach, describe, expect, it, vi } from "vitest";

import {
  embedText,
  embeddingDimension,
  embeddingModel,
  embeddingProvider,
  formatVector,
} from "@/lib/embeddings";

describe("embedding gateway", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.EMBEDDING_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.VOYAGE_API_KEY;
    delete process.env.EMBEDDING_MODEL;
  });

  it("키가 없으면 외부 호출 전에 설정 오류를 낸다", async () => {
    await expect(embedText("테스트 문장")).rejects.toMatchObject({
      error_code: "embedding_not_configured",
    });
  });

  it("OpenAI embeddings 응답의 벡터를 반환한다", async () => {
    process.env.EMBEDDING_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.EMBEDDING_MODEL = "text-embedding-3-small";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ embedding: [0.1, 0.2, 0.3] }],
            usage: { prompt_tokens: 3 },
          }),
          { status: 200 },
        ),
      );

    await expect(embedText("테스트 문장")).resolves.toEqual({
      vector: [0.1, 0.2, 0.3],
      model: "text-embedding-3-small",
      inputTokens: 3,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          input: "테스트 문장",
          model: "text-embedding-3-small",
        }),
      }),
    );
  });

  it("Voyage embeddings 응답을 검색 query 타입으로 반환한다", async () => {
    process.env.EMBEDDING_PROVIDER = "voyage";
    process.env.VOYAGE_API_KEY = "voyage-test";
    process.env.EMBEDDING_MODEL = "voyage-4-lite";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ embedding: [0.4, 0.5, 0.6] }],
            usage: { total_tokens: 4 },
          }),
          { status: 200 },
        ),
      );

    await expect(
      embedText("테스트 질문", { inputType: "query" }),
    ).resolves.toEqual({
      vector: [0.4, 0.5, 0.6],
      model: "voyage-4-lite",
      inputTokens: 4,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.voyageai.com/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          input: "테스트 질문",
          model: "voyage-4-lite",
          input_type: "query",
          output_dimension: 1024,
          output_dtype: "float",
        }),
      }),
    );
  });

  it("네트워크 오류도 안전한 embedding_api_failed 코드로 변환한다", async () => {
    process.env.EMBEDDING_PROVIDER = "voyage";
    process.env.VOYAGE_API_KEY = "voyage-test";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network down"));

    await expect(embedText("테스트 문장")).rejects.toMatchObject({
      error_code: "embedding_api_failed",
    });
  });

  it("D2 기본 모델·차원과 pgvector 문자열 형식을 고정한다", () => {
    expect(embeddingProvider()).toBe("voyage");
    expect(embeddingModel()).toBe("voyage-4-lite");
    expect(embeddingDimension()).toBe(1024);
    expect(formatVector([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
  });
});
