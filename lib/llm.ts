import Groq, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from "groq-sdk";
import { toFile } from "groq-sdk/uploads";
import { z } from "zod";

import { toStrictJsonSchema } from "@/lib/contracts";
import { MASK_PATTERNS } from "@/lib/mask";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const CLASSIFICATION_MODEL = "openai/gpt-oss-20b";
const GENERATION_MODEL = "openai/gpt-oss-120b";
const TRANSCRIPTION_MODEL = "whisper-large-v3-turbo";

type ModelId =
  | typeof CLASSIFICATION_MODEL
  | typeof GENERATION_MODEL
  | typeof TRANSCRIPTION_MODEL;
type TokenPrice = { input: number; output: number };

// PRD §10 #19가 확인되기 전에는 비용을 추정하지 않는다.
const GROQ_PRICING_USD_PER_MILLION_TOKENS: Record<
  ModelId,
  TokenPrice | null
> = {
  [CLASSIFICATION_MODEL]: null,
  [GENERATION_MODEL]: null,
  [TRANSCRIPTION_MODEL]: null,
};

const MAX_TRANSIENT_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;
const GROQ_REQUEST_TIMEOUT_MS = 60_000;
const FIELD_ORDER_INSTRUCTION =
  "응답 스키마에 citations가 있으면 citations를 먼저 채우고, 그다음 근거(background 또는 reasoning), 결론(answer 또는 recommendation)은 마지막에 작성하세요.";
export const PLAIN_LANGUAGE_INSTRUCTION =
  "한국어로 씁니다. 중학교 2학년도 이해할 수 있는 쉬운 낱말과 짧은 문장을 씁니다. 한 문장에는 한 가지 뜻만 담고, 안내·오류·답변은 합니다/하세요 문체를 씁니다. 내부 코드·영문 상태값·근거 없는 계획은 쓰지 않습니다. 원문 인용은 그대로 두고 새로 쓰는 문장만 쉽게 씁니다.";

const REFUSAL_TEXT_PATTERNS = [
  /(?:도와|답변|제공|처리).{0,12}(?:드릴|할) 수 없(?:습니다|어요)/,
  /(?:요청|질문).{0,12}(?:거절|답변할 수 없)/,
  /(?:cannot|can't|unable to).{0,24}(?:assist|comply|provide|answer)/i,
  /i(?:'m| am) sorry.{0,40}(?:cannot|can't|unable)/i,
];

export type LlmPurpose =
  | "retro_draft"
  | "classify"
  | "merge_confirm"
  | "make_card"
  | "answer"
  | "summarize_meeting"
  | "summarize_document"
  | "run_agent_role"
  | "trailer_generate"
  | "trailer_score"
  | "transcribe_voice"
  | "generic_answer";

export type LlmResult<T> = {
  data: T;
  meta: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
  };
};

export type LlmErrorCode =
  | "llm_timeout"
  | "llm_refusal"
  | "schema_invalid"
  | "rate_limited"
  | "auth"
  | "unmasked_prompt"
  | "voice_transcription_empty"
  | "llm_request_failed";

export class LlmGatewayError extends Error {
  constructor(
    message: string,
    public readonly error_code: LlmErrorCode,
  ) {
    super(message);
    this.name = "LlmGatewayError";
  }
}

export class LlmTimeoutError extends LlmGatewayError {
  constructor() {
    super("Groq 호출이 제한 시간 안에 완료되지 않았습니다.", "llm_timeout");
    this.name = "LlmTimeoutError";
  }
}

export class RefusalError extends LlmGatewayError {
  constructor() {
    super("모델이 요청 처리를 거절했습니다.", "llm_refusal");
    this.name = "RefusalError";
  }
}

export class SchemaInvalidError extends LlmGatewayError {
  constructor() {
    super("모델 응답이 요청한 스키마와 일치하지 않습니다.", "schema_invalid");
    this.name = "SchemaInvalidError";
  }
}

export class RateLimitedError extends LlmGatewayError {
  constructor() {
    super("Groq 요청 한도를 초과했습니다.", "rate_limited");
    this.name = "RateLimitedError";
  }
}

type LlmOptions = { deptId?: string; jobId?: string };

type CompletionUsage = {
  inputTokens: number;
  outputTokens: number;
};

function modelForPurpose(purpose: LlmPurpose): ModelId {
  if (purpose === "classify" || purpose === "merge_confirm") {
    return CLASSIFICATION_MODEL;
  }
  if (purpose === "transcribe_voice") return TRANSCRIPTION_MODEL;
  return GENERATION_MODEL;
}

function assertPromptIsMasked(prompt: { system: string; user: string }): void {
  const combined = `${prompt.system}\n${prompt.user}`;

  if (MASK_PATTERNS.some(({ re }) => re.test(combined))) {
    throw new LlmGatewayError(
      "마스킹되지 않은 개인정보가 프롬프트에 남아 있습니다.",
      "unmasked_prompt",
    );
  }
}

function calculateCost(
  model: ModelId,
  usage: CompletionUsage,
): number | null {
  const price = GROQ_PRICING_USD_PER_MILLION_TOKENS[model];

  if (price === null) {
    return null;
  }

  return (
    (usage.inputTokens * price.input + usage.outputTokens * price.output) /
    1_000_000
  );
}

async function recordLlmCall(
  purpose: LlmPurpose,
  model: ModelId,
  usage: CompletionUsage | null,
  durationMs: number,
  opts?: LlmOptions,
): Promise<void> {
  try {
    const client = createServiceSupabaseClient();
    await client.from("llm_calls").insert({
      purpose,
      model,
      input_tokens: usage?.inputTokens ?? null,
      output_tokens: usage?.outputTokens ?? null,
      cost_usd: usage === null ? null : calculateCost(model, usage),
      duration_ms: durationMs,
      dept_id: opts?.deptId ?? null,
      job_id: opts?.jobId ?? null,
    });
  } catch {
    // 비용 기록은 best-effort다. 실패해도 모델 호출 결과를 뒤집지 않는다.
  }
}

function isRetryableError(error: unknown): boolean {
  if (
    error instanceof APIConnectionTimeoutError ||
    error instanceof APIConnectionError
  ) {
    return true;
  }

  return (
    error instanceof APIError &&
    (error.status === 429 || (error.status !== undefined && error.status >= 500))
  );
}

function sanitizedError(error: unknown): LlmGatewayError {
  if (error instanceof LlmGatewayError) {
    return error;
  }

  if (error instanceof APIConnectionError) {
    return new LlmTimeoutError();
  }

  if (error instanceof APIError) {
    if (error.status === 429) {
      return new RateLimitedError();
    }

    if (error.status === 400 || error.status === 422) {
      return new SchemaInvalidError();
    }

    if (error.status === 401 || error.status === 403) {
      return new LlmGatewayError(
        "Groq 인증에 실패했습니다.",
        "auth",
      );
    }

    if (error.status !== undefined && error.status >= 500) {
      return new LlmTimeoutError();
    }

    return new LlmGatewayError(
      `Groq 요청이 실패했습니다 (HTTP ${error.status ?? "unknown"}).`,
      "llm_request_failed",
    );
  }

  return new LlmGatewayError(
    "Groq 요청을 완료하지 못했습니다.",
    "llm_request_failed",
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRefusalText(content: string): boolean {
  return REFUSAL_TEXT_PATTERNS.some((pattern) => pattern.test(content));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRefusalPayload(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }

  if (value.refused === true) {
    return true;
  }

  return Array.isArray(value.citations) && value.citations.length === 0;
}

async function createCompletion(
  client: Groq,
  purpose: LlmPurpose,
  model: ModelId,
  responseSchema: Record<string, unknown>,
  prompt: { system: string; user: string },
  opts?: LlmOptions,
) {
  const startedAt = performance.now();
  let usage: CompletionUsage | null = null;

  try {
    const completion = await client.chat.completions.create({
      model,
      stream: false,
      messages: [
        {
          role: "system",
          content: `${PLAIN_LANGUAGE_INSTRUCTION}\n${prompt.system}\n\n${FIELD_ORDER_INSTRUCTION}`,
        },
        { role: "user", content: prompt.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: `${purpose}_response`,
          schema: responseSchema,
          strict: true,
        },
      },
    });

    usage = {
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    };

    return completion;
  } finally {
    const durationMs = Math.round(performance.now() - startedAt);
    await recordLlmCall(purpose, model, usage, durationMs, opts);
  }
}

async function createCompletionWithRetry(
  client: Groq,
  purpose: LlmPurpose,
  model: ModelId,
  responseSchema: Record<string, unknown>,
  prompt: { system: string; user: string },
  opts?: LlmOptions,
) {
  for (let attempt = 1; attempt <= MAX_TRANSIENT_ATTEMPTS; attempt += 1) {
    try {
      return await createCompletion(
        client,
        purpose,
        model,
        responseSchema,
        prompt,
        opts,
      );
    } catch (error) {
      if (!isRetryableError(error) || attempt === MAX_TRANSIENT_ATTEMPTS) {
        throw sanitizedError(error);
      }

      await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  throw new LlmTimeoutError();
}

async function structured<T>(
  purpose: LlmPurpose,
  schema: z.ZodType<T>,
  prompt: { system: string; user: string },
  opts?: LlmOptions,
): Promise<LlmResult<T>> {
  assertPromptIsMasked(prompt);

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new LlmGatewayError(
      "GROQ_API_KEY가 설정되지 않았습니다.",
      "auth",
    );
  }

  const model = modelForPurpose(purpose);
  const responseSchema = toStrictJsonSchema(
    `${purpose}_response`,
    schema,
  ) as Record<string, unknown>;
  const client = new Groq({
    apiKey,
    maxRetries: 0,
    timeout: GROQ_REQUEST_TIMEOUT_MS,
  });
  const startedAt = performance.now();
  let refusalRetries = 0;
  let schemaRetries = 0;

  while (true) {
    let completion;
    try {
      completion = await createCompletionWithRetry(client, purpose, model, responseSchema, prompt, opts);
    } catch (error) {
      // Providers may reject invalid generated JSON at the HTTP boundary.
      // Share the same single schema retry as local JSON/schema validation.
      if (error instanceof SchemaInvalidError && schemaRetries < 1) {
        schemaRetries += 1;
        continue;
      }
      throw error;
    }
    const content = completion.choices[0]?.message.content ?? "";
    let candidate: unknown;

    try {
      candidate = JSON.parse(content);
    } catch {
      if (isRefusalText(content)) {
        if (refusalRetries < 1) {
          refusalRetries += 1;
          continue;
        }

        throw new RefusalError();
      }

      if (schemaRetries < 1) {
        schemaRetries += 1;
        continue;
      }

      throw new SchemaInvalidError();
    }

    if (isRefusalPayload(candidate)) {
      if (refusalRetries < 1) {
        refusalRetries += 1;
        continue;
      }

      throw new RefusalError();
    }

    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      if (schemaRetries < 1) {
        schemaRetries += 1;
        continue;
      }

      throw new SchemaInvalidError();
    }

    return {
      data: parsed.data,
      meta: {
        model,
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
        durationMs: Math.round(performance.now() - startedAt),
      },
    };
  }
}

export type AudioTranscriptionInput = {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
};

async function transcribeAudio(
  input: AudioTranscriptionInput,
  opts?: LlmOptions,
): Promise<LlmResult<{ text: string }>> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new LlmGatewayError(
      "GROQ_API_KEY가 설정되지 않았습니다.",
      "auth",
    );
  }

  const client = new Groq({
    apiKey,
    maxRetries: 0,
    timeout: GROQ_REQUEST_TIMEOUT_MS,
  });
  const startedAt = performance.now();
  try {
    let transcription;
    for (let attempt = 1; attempt <= MAX_TRANSIENT_ATTEMPTS; attempt += 1) {
      try {
        const file = await toFile(input.bytes, input.filename, {
          type: input.mimeType || "application/octet-stream",
        });
        transcription = await client.audio.transcriptions.create({
          file,
          model: TRANSCRIPTION_MODEL,
          language: "ko",
          response_format: "json",
          temperature: 0,
        });
        break;
      } catch (error) {
        if (!isRetryableError(error) || attempt === MAX_TRANSIENT_ATTEMPTS) {
          throw sanitizedError(error);
        }
        await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }

    const text = transcription?.text?.trim() ?? "";
    if (!text) {
      throw new LlmGatewayError(
        "음성에서 질문을 확인하지 못했습니다.",
        "voice_transcription_empty",
      );
    }
    return {
      data: { text },
      meta: {
        model: TRANSCRIPTION_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Math.round(performance.now() - startedAt),
      },
    };
  } finally {
    await recordLlmCall(
      "transcribe_voice",
      TRANSCRIPTION_MODEL,
      null,
      Math.round(performance.now() - startedAt),
      opts,
    );
  }
}

export const llm = { structured, transcribeAudio };
