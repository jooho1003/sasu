import { createHash, randomUUID } from "node:crypto";

import { after } from "next/server";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type JobKind =
  | "classify"
  | "embed"
  | "summarize_meeting"
  | "summarize_document"
  | "make_card"
  | "answer"
  | "send_slack"
  | "notion_import"
  | "slack_backfill"
  | "sweep";

type JobRow = {
  id: string;
  kind: string;
  payload: unknown;
  attempts: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JobHandler = (payload: any) => Promise<void>;

type OwnerReference = {
  payloadKey: string;
  column: string;
};

type FailureOwnerMapping = {
  table: "classifications" | "decision_requests" | "answers" | "items" | "meetings" | "sources" | "document_summaries";
  references: OwnerReference[];
  write: "update" | "upsert";
  values: (ownerId: string, errorCode: string) => Record<string, unknown>;
};

const MAX_ATTEMPTS = 3;
const DEFAULT_CLAIM_LIMIT = 10;
const MAX_CLAIM_LIMIT = 100;
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_JITTER_MS = 1_000;
const SWEEP_TIMEOUT_MS = 2 * 60 * 1_000;

const SAFE_ERROR_CODES = new Set([
  "auth",
  "citation_invalid",
  "embedding_api_failed",
  "embedding_not_configured",
  "embedding_rate_limited",
  "job_failed",
  "llm_refusal",
  "llm_request_failed",
  "llm_timeout",
  "rate_limited",
  "schema_invalid",
  "slack_api_failed",
  "slack_dm_unavailable",
  "slack_not_configured",
  "slack_rate_limited",
  "notion_api_failed",
  "notion_not_configured",
  "notion_rate_limited",
  "unknown_kind",
  "unmasked_prompt",
  "voice_transcription_empty",
]);

// 3회 실패가 사용자에게 보이는 상태로 이어지는 규칙은 이 표 한 곳에 둔다.
const FAILURE_OWNER_MAPPINGS: Partial<
  Record<JobKind, FailureOwnerMapping>
> = {
  classify: {
    table: "classifications",
    references: [
      { payloadKey: "itemId", column: "item_id" },
      { payloadKey: "item_id", column: "item_id" },
    ],
    write: "upsert",
    values: (itemId) => ({
      item_id: itemId,
      label: "unclassified",
      method: "llm",
      confidence: null,
      deadline_hint: null,
      assignee_hint: null,
      reasoning: null,
    }),
  },
  embed: {
    table: "items",
    references: [
      { payloadKey: "itemId", column: "id" },
      { payloadKey: "item_id", column: "id" },
    ],
    write: "update",
    values: () => ({ embed_status: "failed" }),
  },
  make_card: {
    table: "decision_requests",
    references: [
      { payloadKey: "requestId", column: "id" },
      { payloadKey: "request_id", column: "id" },
      { payloadKey: "itemId", column: "origin_item_id" },
      { payloadKey: "item_id", column: "origin_item_id" },
    ],
    write: "update",
    values: () => ({ status: "needs_review" }),
  },
  send_slack: {
    table: "decision_requests",
    references: [
      { payloadKey: "requestId", column: "id" },
      { payloadKey: "request_id", column: "id" },
    ],
    write: "update",
    values: (_requestId, errorCode) => ({
      slack_delivery_status: "failed",
      slack_delivery_error: errorCode,
    }),
  },
  answer: {
    table: "answers",
    references: [
      { payloadKey: "answerId", column: "id" },
      { payloadKey: "answer_id", column: "id" },
    ],
    write: "update",
    values: (_answerId, errorCode) => ({
      status: "failed",
      error_code: errorCode,
    }),
  },
  notion_import: {
    table: "sources",
    references: [{ payloadKey: "sourceId", column: "id" }],
    write: "update",
    values: (_sourceId, errorCode) => ({ last_error: errorCode }),
  },
  summarize_meeting: {
    table: "meetings",
    references: [{ payloadKey: "meetingId", column: "id" }],
    write: "update",
    values: (_meetingId, errorCode) => ({ status: "summary_failed", status_reason: errorCode }),
  },
  summarize_document: {
    table: "document_summaries",
    references: [{ payloadKey: "documentId", column: "source_id" }],
    write: "update",
    values: (_documentId, errorCode) => ({ status: "summary_failed", status_reason: errorCode }),
  },
};

const handlers = new Map<JobKind, JobHandler>();

class JobWorkerDatabaseError extends Error {
  constructor() {
    super("Job worker database operation failed");
    this.name = "JobWorkerDatabaseError";
  }
}

function deterministicJobId(kind: JobKind, dedupeKey: string): string {
  const hex = createHash("sha256")
    .update(`sasu-job:${kind}:${dedupeKey}`)
    .digest("hex")
    .slice(0, 32)
    .split("");

  // UUID v5 모양으로 고정해 같은 kind+dedupeKey가 같은 PK를 사용하게 한다.
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const compact = hex.join("");

  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function sanitizeErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return "job_failed";
  }

  const errorCode = Reflect.get(error, "error_code");
  return typeof errorCode === "string" && SAFE_ERROR_CODES.has(errorCode)
    ? errorCode
    : "job_failed";
}

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

function ownerReference(
  mapping: FailureOwnerMapping,
  payload: unknown,
): { column: string; id: string } | null {
  const record = payloadRecord(payload);
  if (record === null) {
    return null;
  }

  for (const reference of mapping.references) {
    const value = record[reference.payloadKey];
    if (typeof value === "string" && value.length > 0) {
      return { column: reference.column, id: value };
    }
  }

  return null;
}

function retryAt(attempts: number): string {
  const exponentialDelay = RETRY_BASE_DELAY_MS * 2 ** Math.max(1, attempts);
  const jitter = Math.floor(Math.random() * RETRY_JITTER_MS);
  return new Date(Date.now() + exponentialDelay + jitter).toISOString();
}

async function updateJob(
  client: ReturnType<typeof createServiceSupabaseClient>,
  jobId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.from("jobs").update(values).eq("id", jobId);
  if (error) {
    throw new JobWorkerDatabaseError();
  }
}

async function updateFailureOwner(
  client: ReturnType<typeof createServiceSupabaseClient>,
  job: JobRow,
  errorCode: string,
): Promise<void> {
  const mapping = FAILURE_OWNER_MAPPINGS[job.kind as JobKind];
  if (!mapping) {
    return;
  }

  const reference = ownerReference(mapping, job.payload);
  if (!reference) {
    return;
  }

  const values = mapping.values(reference.id, errorCode);
  const result =
    mapping.write === "upsert"
      ? await client.from(mapping.table).upsert(values)
      : await client
          .from(mapping.table)
          .update(values)
          .eq(reference.column, reference.id);

  if (result.error) {
    throw new JobWorkerDatabaseError();
  }
}

async function sweepPendingRows(): Promise<void> {
  const client = createServiceSupabaseClient();
  const cutoff = new Date(Date.now() - SWEEP_TIMEOUT_MS).toISOString();
  const answerResult = await client
    .from("answers")
    .update({ status: "failed", error_code: "llm_timeout" })
    .eq("status", "pending")
    .lt("created_at", cutoff);

  if (answerResult.error) {
    throw new JobWorkerDatabaseError();
  }

  const documentResult = await client
    .from("document_summaries")
    .update({ status: "summary_failed", status_reason: "llm_timeout", updated_at: new Date().toISOString() })
    .eq("status", "processing")
    .lt("created_at", cutoff);

  if (documentResult.error) {
    throw new JobWorkerDatabaseError();
  }

  const cardResult = await client
    .from("decision_requests")
    .update({ status: "needs_review" })
    .eq("status", "pending")
    .lt("opened_at", cutoff);

  if (cardResult.error) {
    throw new JobWorkerDatabaseError();
  }
}

export async function enqueue(
  kind: JobKind,
  payload: unknown,
  opts?: { dedupeKey?: string; runAfter?: Date },
): Promise<string> {
  const client = createServiceSupabaseClient();
  const id = opts?.dedupeKey
    ? deterministicJobId(kind, opts.dedupeKey)
    : randomUUID();
  const { data, error } = await client
    .from("jobs")
    .insert({
      id,
      kind,
      payload,
      run_after: opts?.runAfter?.toISOString() ?? new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (opts?.dedupeKey && error.code === "23505") {
      return id;
    }
    throw new JobWorkerDatabaseError();
  }

  if (!data?.id) {
    throw new JobWorkerDatabaseError();
  }

  return data.id;
}

export function registerHandler(kind: JobKind, fn: JobHandler): void {
  handlers.set(kind, fn);
}

export async function runOnce(
  limit = DEFAULT_CLAIM_LIMIT,
): Promise<{ claimed: number; done: number; failed: number }> {
  const claimLimit = Math.min(
    MAX_CLAIM_LIMIT,
    Math.max(1, Math.trunc(limit)),
  );
  const client = createServiceSupabaseClient();
  const { data, error } = await client.rpc("claim_jobs", {
    p_limit: claimLimit,
  });

  if (error) {
    throw new JobWorkerDatabaseError();
  }

  const jobs = (data ?? []) as JobRow[];
  let done = 0;
  let failed = 0;

  for (const job of jobs) {
    const handler = handlers.get(job.kind as JobKind);

    if (!handler) {
      await updateJob(client, job.id, {
        status: "failed",
        last_error: "unknown_kind",
        updated_at: new Date().toISOString(),
      });
      failed += 1;
      continue;
    }

    try {
      await handler(job.payload);
      await updateJob(client, job.id, {
        status: "done",
        last_error: null,
        updated_at: new Date().toISOString(),
      });
      done += 1;
    } catch (handlerError) {
      const errorCode = sanitizeErrorCode(handlerError);

      if (job.attempts >= MAX_ATTEMPTS) {
        await updateFailureOwner(client, job, errorCode);
        await updateJob(client, job.id, {
          status: "failed",
          last_error: errorCode,
          updated_at: new Date().toISOString(),
        });
        failed += 1;
        continue;
      }

      await updateJob(client, job.id, {
        status: "queued",
        run_after: retryAt(job.attempts),
        last_error: errorCode,
        updated_at: new Date().toISOString(),
      });
    }
  }

  return { claimed: jobs.length, done, failed };
}

export function kickWorker(): void {
  after(() => runOnce());
}

registerHandler("sweep", sweepPendingRows);
