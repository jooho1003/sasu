export type EmbeddingResult = {
  vector: number[];
  model: string;
  inputTokens: number | null;
};

export type EmbeddingBatchResult = {
  vectors: number[][];
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
  readonly retryAfterSeconds?: number;

  constructor(
    errorCode:
      | "embedding_not_configured"
      | "embedding_rate_limited"
      | "embedding_api_failed",
    retryAfterSeconds?: number,
  ) {
    super(errorCode);
    this.name = "EmbeddingError";
    this.error_code = errorCode;
    this.retryAfterSeconds = retryAfterSeconds;
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

export async function embedTexts(
  inputs: string[],
  inputType?: EmbeddingInputType,
): Promise<EmbeddingBatchResult> {
  if (inputs.length === 0) {
    throw new EmbeddingError("embedding_api_failed");
  }
  const provider = embeddingProvider();
  const key = apiKey(provider);
  const model = embeddingModel();
  const body =
    provider === "voyage"
      ? {
          input: inputs,
          model,
          ...(inputType ? { input_type: inputType } : {}),
          output_dimension: embeddingDimension(),
          output_dtype: "float",
        }
      : { input: inputs, model };
  let response: Response;
  try {
    response = await fetch(
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
  } catch {
    throw new EmbeddingError("embedding_api_failed");
  }

  if (response.status === 429) {
    const value = Number(response.headers.get("retry-after"));
    const retryAfterSeconds = Number.isFinite(value) && value >= 0
      ? Math.min(3600, value)
      : undefined;
    throw new EmbeddingError("embedding_rate_limited", retryAfterSeconds);
  }

  let payload: EmbeddingResponse;
  try {
    payload = (await response.json()) as EmbeddingResponse;
  } catch {
    throw new EmbeddingError("embedding_api_failed");
  }

  if (!response.ok) {
    throw new EmbeddingError("embedding_api_failed");
  }

  const vectors = payload.data?.map((entry) => entry.embedding);
  if (!vectors || vectors.length !== inputs.length || vectors.some((vector) =>
    !Array.isArray(vector) ||
    vector.length === 0 ||
    vector.some((value) => typeof value !== "number" || !Number.isFinite(value)))) {
    throw new EmbeddingError("embedding_api_failed");
  }

  const tokenCount =
    provider === "voyage"
      ? payload.usage?.total_tokens
      : payload.usage?.prompt_tokens;
  const inputTokens = typeof tokenCount === "number" ? tokenCount : null;
  return { vectors: vectors as number[][], model, inputTokens };
}

export async function embedText(
  input: string,
  options: { inputType?: EmbeddingInputType } = {},
): Promise<EmbeddingResult> {
  const result = await embedTexts([input], options.inputType);
  return {
    vector: result.vectors[0],
    model: result.model,
    inputTokens: result.inputTokens,
  };
}
