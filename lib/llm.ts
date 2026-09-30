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
  "한국어로 씁니다. 중학교 2학년도 이해할 수 있는 쉬운 낱말을 씁니다. 새 문장은 20~30자를 목표로 쓰고 공백·문장부호를 포함해 40자를 넘기지 않습니다. 한 문장에 사실 하나만 씁니다. 조건·이유·행동이 길게 이어지면 각각 마침표로 나누되 조건과 부정 표현은 빼지 않습니다. background·recommendation·overview도 짧은 여러 문장으로 씁니다. 예: '견적이 12% 올랐습니다. 기준을 넘으면 재입찰을 확인합니다.' 제목·이름표 외의 새 문장은 합니다/습니다/하세요로 끝냅니다. 어려운 사무 용어와 영어 단어·약어를 풀어 씁니다(원장→결정 기록, 인용→원문 근거, 산정→계산). 내부 코드·영문 상태값·근거 없는 계획은 쓰지 않습니다. 원문 그대로 옮기는 quote 필드는 한 글자도 바꾸지 않고, 새로 쓰는 문장에만 이 규칙을 적용합니다. 원문 복사가 요구된 다른 필드도 그대로 유지합니다. 반환 전에 새 문장마다 길이와 끝맺음을 확인하세요.";

// Quality guidance only. Never rewrite evidence or reject a response for style.
export const GENERATED_PROSE_INSTRUCTION = [
  "카드·문서 요약의 새 문장 작성:",
  "title은 핵심 할 일을 20자 안으로 적으세요. background·recommendation·overview는 한 문장을 15~25자로 짧게 잡고, 공백과 마침표를 포함해 최대 40자로 쓰세요. 문장마다 마침표를 넣으세요.",
  "여러 사실을 한 문장으로 압축하지 마세요. 특히 overview는 전체 내용을 한 문장에 모으지 말고 짧은 문장 여러 개로 나누세요. 제목을 제외한 각 문장은 합니다·습니다·하세요로 끝내세요.",
  "새 문장의 용어는 문맥에 맞게 풀어 쓰세요: 보류→미루다, 반려→돌려보내다, 명시→적다, 누락→빠지다, 산정→계산하다, 수용→받아들이다, 부서장·영업 리드→팀장, 열람·조회→보기, 인용→원문 근거, 원장→결정 기록, 갱신→새로 고치다, 집행→확인하다. 해당 용어를 다시 괄호에 적지 마세요.",
  "예: '계약 확정을 보류합니다'는 '계약 확정을 미룹니다.'로, '담당자를 명시하세요'는 '담당자를 적으세요.'로 적습니다. 이 예문의 사실을 응답에 추가하지 마세요.",
  "문장을 나눠도 조건·부정·숫자·담당자·기한과 원문의 뜻을 유지하세요. 조건부 행동을 무조건 실행하는 문장으로 바꾸지 마세요. 짧게 쓰기 위해 사실을 빼지 마세요.",
  "이 지시는 새로 쓰는 title·background·recommendation·overview에만 적용합니다. quote와 그 밖에 원문 복사가 요구된 필드는 길거나 어려운 말이 있어도 한 글자도 바꾸지 마세요. 필드 이름·ID·상태값도 바꾸지 마세요.",
].join("\n");

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
  | "sales_quote_review"
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
  | "llm_budget_exceeded"
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
    const payload = isObject(error.error) && isObject(error.error.error) ? error.error.error : error.error;
    if (isObject(payload) && payload.code === "spend_limit_reached") {
      return new LlmGatewayError("인공지능 사용 한도에 도달했습니다. 관리자에게 한도 확인을 요청하세요.", "llm_budget_exceeded");
    }
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
          content: `${PLAIN_LANGUAGE_INSTRUCTION}\n${prompt.system}\n${purpose === "make_card" || purpose === "summarize_document" ? GENERATED_PROSE_INSTRUCTION + "\n" : ""}\n${FIELD_ORDER_INSTRUCTION}`,
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

    const parsed = schema.safeParse(candidate);
    // ASK의 거절은 필수 필드와 타입이 유효할 때만 인정한다.
    const refused = purpose === "answer"
      ? parsed.success && isRefusalPayload(parsed.data)
      : isRefusalPayload(candidate);
    if (refused) {
      if (refusalRetries < 1) {
        refusalRetries += 1;
        continue;
      }

      throw new RefusalError();
    }

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
  // Word timestamps add latency; the short ASK path keeps the JSON default.
  includeTimestamps?: boolean;
  // The caller owns Groq's 224-token prompt budget (future glossary path).
  prompt?: string;
};

export type AudioTranscriptionSegment = {
  text: string;
  start: number;
  end: number;
  avg_logprob: number | null;
  no_speech_prob: number | null;
};

export type AudioTranscriptionWord = { word: string; start: number; end: number };

export type AudioTranscriptionData = {
  text: string;
  segments: AudioTranscriptionSegment[];
  words: AudioTranscriptionWord[];
};

const transcriptionTime = z.number().finite().nonnegative();
const transcriptionSegment = z.object({
  text: z.string(),
  start: transcriptionTime,
  end: transcriptionTime,
  avg_logprob: z.number().finite().nullable().optional(),
  no_speech_prob: z.number().finite().min(0).max(1).nullable().optional(),
}).refine((segment) => segment.end >= segment.start);
const transcriptionWord = z.object({
  word: z.string(),
  start: transcriptionTime,
  end: transcriptionTime,
}).refine((word) => word.end >= word.start);
const timestampedTranscription = z.object({
  segments: z.array(transcriptionSegment),
  words: z.array(transcriptionWord),
});

async function transcribeAudio(
  input: AudioTranscriptionInput,
  opts?: LlmOptions,
): Promise<LlmResult<AudioTranscriptionData>> {
  const prompt = input.prompt?.trim();
  if (prompt) assertPromptIsMasked({ system: "", user: prompt });
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
          response_format: input.includeTimestamps ? "verbose_json" : "json",
          ...(input.includeTimestamps ? { timestamp_granularities: ["word", "segment"] as const } : {}),
          ...(prompt ? { prompt } : {}),
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

    const text = typeof transcription?.text === "string" ? transcription.text.trim() : "";
    if (!text) {
      throw new LlmGatewayError(
        "음성에서 질문을 확인하지 못했습니다.",
        "voice_transcription_empty",
      );
    }
    let segments: AudioTranscriptionSegment[] = [];
    let words: AudioTranscriptionWord[] = [];
    if (input.includeTimestamps) {
      const parsed = timestampedTranscription.safeParse(transcription);
      if (!parsed.success) throw new SchemaInvalidError();
      segments = parsed.data.segments.map((segment) => ({
        text: segment.text,
        start: segment.start,
        end: segment.end,
        avg_logprob: segment.avg_logprob ?? null,
        no_speech_prob: segment.no_speech_prob ?? null,
      }));
      words = parsed.data.words;
    }
    return {
      data: { text, segments, words },
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
