export type EmbeddingResult = {
  vector: number[];
  model: string;
  inputTokens: number | null;
};

type EmbeddingResponse = {
  data?: Array<{ embedding?: unknown }>;
  usage?: { prompt_tokens?: unknown };
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

export function embeddingModel(): string {
  return process.env.EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
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

function apiKey(): string {
  const value = process.env.OPENAI_API_KEY?.trim();
  if (!value) {
    throw new EmbeddingError("embedding_not_configured");
  }
  return value;
}

export async function embedText(input: string): Promise<EmbeddingResult> {
  const key = apiKey();
  const model = embeddingModel();
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ input, model }),
    signal: AbortSignal.timeout(30_000),
  });

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

  const inputTokens =
    typeof payload.usage?.prompt_tokens === "number"
      ? payload.usage.prompt_tokens
      : null;
  return { vector: vector as number[], model, inputTokens };
}
