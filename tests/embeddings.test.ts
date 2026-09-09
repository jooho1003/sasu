import { afterEach, describe, expect, it, vi } from "vitest";

import { embedText, embeddingModel, formatVector } from "@/lib/embeddings";

describe("embedding gateway", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.EMBEDDING_MODEL;
  });

  it("키가 없으면 외부 호출 전에 설정 오류를 낸다", async () => {
    await expect(embedText("테스트 문장")).rejects.toMatchObject({
      error_code: "embedding_not_configured",
    });
  });

  it("OpenAI embeddings 응답의 벡터를 반환한다", async () => {
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

  it("모델 기본값과 pgvector 문자열 형식을 고정한다", () => {
    expect(embeddingModel()).toBe("text-embedding-3-small");
    expect(formatVector([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
  });
});
