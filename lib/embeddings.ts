export type EmbeddingResult = {
  vector: number[];
  model: string;
  inputTokens: number | null;
};

export type EmbeddingProvider = "voyage" | "openai";
export type EmbeddingInputType = "query" | "document";

type EmbeddingResponse = {
  data?: Array<{ embedding?: unknown }>;
  usage?: { prompt_tokens?: unknown; total_tokens?: unknown };
  error?: unknown;
};

export class EmbeddingError extends Error {
  readonly error_code:
    | "embedding_not_configured"
    | "embedding_rate_limited"
    | "embedding_api_failed";

  constructor(
    errorCode:
      | "embedding_not_configured"
      | "embedding_rate_limited"
      | "embedding_api_failed",
  ) {
    super(errorCode);
    this.name = "EmbeddingError";
    this.error_code = errorCode;
  }
}

export function embeddingProvider(): EmbeddingProvider {
  return process.env.EMBEDDING_PROVIDER?.trim().toLowerCase() === "openai"
    ? "openai"
    : "voyage";
}

export function embeddingModel(): string {
  return (
    process.env.EMBEDDING_MODEL?.trim() ||
    (embeddingProvider() === "voyage"
      ? "voyage-4-lite"
      : "text-embedding-3-small")
  );
}

export function embeddingDimension(): number {
  return embeddingProvider() === "voyage" ? 1024 : 1536;
}

export function formatVector(vector: number[]): string {
  if (
    vector.length === 0 ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new EmbeddingError("embedding_api_failed");
  }
  return `[${vector.join(",")}]`;
}

function apiKey(provider: EmbeddingProvider): string {
  const value =
    provider === "voyage"
      ? process.env.VOYAGE_API_KEY?.trim()
      : process.env.OPENAI_API_KEY?.trim();
  if (!value) {
    throw new EmbeddingError("embedding_not_configured");
  }
  return value;
}

export async function embedText(
  input: string,
  options: { inputType?: EmbeddingInputType } = {},
): Promise<EmbeddingResult> {
  const provider = embeddingProvider();
  const key = apiKey(provider);
  const model = embeddingModel();
  const body =
    provider === "voyage"
      ? {
          input,
          model,
          ...(options.inputType ? { input_type: options.inputType } : {}),
          output_dimension: embeddingDimension(),
          output_dtype: "float",
        }
      : { input, model };
  const response = await fetch(
    provider === "voyage"
      ? "https://api.voyageai.com/v1/embeddings"
      : "https://api.openai.com/v1/embeddings",
    {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
    },
  );

  let payload: EmbeddingResponse;
  try {
    payload = (await response.json()) as EmbeddingResponse;
  } catch {
    throw new EmbeddingError("embedding_api_failed");
  }

  if (response.status === 429) {
    throw new EmbeddingError("embedding_rate_limited");
  }
  if (!response.ok) {
    throw new EmbeddingError("embedding_api_failed");
  }

  const vector = payload.data?.[0]?.embedding;
  if (
    !Array.isArray(vector) ||
    vector.length === 0 ||
    vector.some((value) => typeof value !== "number" || !Number.isFinite(value))
  ) {
    throw new EmbeddingError("embedding_api_failed");
  }

  const tokenCount =
    provider === "voyage"
      ? payload.usage?.total_tokens
      : payload.usage?.prompt_tokens;
  const inputTokens = typeof tokenCount === "number" ? tokenCount : null;
  return { vector: vector as number[], model, inputTokens };
}
