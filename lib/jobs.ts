import { withSlackJob } from "@/lib/slack/workspace";
import { withNotionForJob } from "@/lib/notion-workspace";
import { createHash, randomUUID } from "node:crypto";

import { after } from "next/server";

import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { trailerPublishEnabled, trailerScoresMode } from "@/lib/features";

export type JobKind =
  | "classify"
  | "embed"
  | "embed_batch"
  | "embed_decision"
  | "summarize_meeting"
  | "summarize_document"
  | "run_agent_role"
  | "run_sales_review"
  | "run_sales_source_review"
  | "generate_trailer"
  | "check_trailer_gate"
  | "score_trailer_attempt"
  | "make_card"
  | "answer"
  | "send_slack"
  | "send_reminder"
  | "deliver_slack_answer"
  | "notion_import"
  | "notion_discover"
  | "notion_poll"
  | "slack_backfill"
  | "process_review"
  | "verify_review_segment"
  | "purge_review_files"
  | "purge_trailer_invites"
  | "retro_draft"
  | "retro_pull"
  | "sweep";

type JobRow = {
  id: string;
  kind: string;
  payload: unknown;
  attempts: number;
  lane: JobLane;
  created_at: string;
};

export type JobLane = "realtime" | "bulk";
type JobHandlerResult = void | { requeue?: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JobHandler = (payload: any) => Promise<JobHandlerResult>;

type OwnerReference = {
  payloadKey: string;
  column: string;
};

type FailureOwnerMapping = {
  table: "classifications" | "decision_requests" | "answers" | "items" | "meetings" | "sources" | "notion_roots" | "document_summaries" | "agent_role_results" | "sales_review_tasks" | "sales_source_reviews" | "trailers" | "trailer_attempts";
  references: OwnerReference[];
  write: "update" | "upsert";
  values: (ownerId: string, errorCode: string) => Record<string, unknown>;
};

// supabase/migrations/0016_jobs_lease.sql의 claim_jobs()와 반드시 같은 값이어야 한다.
export const MAX_ATTEMPTS = 3;
const DEFAULT_CLAIM_LIMIT = 10;
const MAX_CLAIM_LIMIT = 100;
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_JITTER_MS = 1_000;
const SWEEP_TIMEOUT_MS = 2 * 60 * 1_000;
const AGENT_ROLE_SWEEP_TIMEOUT_MS = 20 * 60 * 1_000;
const BULK_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1_000;
const NOTION_LEASE_RETRY_MS = 5_000;

const SAFE_ERROR_CODES = new Set([
  "auth",
  "citation_invalid",
  "embedding_api_failed",
  "embedding_not_configured",
  "embedding_rate_limited",
  "job_failed",
  "llm_refusal",
  "llm_request_failed",
  "llm_budget_exceeded",
  "llm_timeout",
  "rate_limited",
  "schema_invalid",
  "slack_api_failed",
  "slack_message_missing",
  "slack_dm_unavailable",
  "slack_not_configured",
  "slack_rate_limited",
  "notion_api_failed",
  "notion_database_unsupported",
  "notion_not_configured",
  "notion_not_found",
  "notion_page_too_large",
  "notion_rate_limited",
  "unknown_kind",
  "unmasked_prompt",
  "voice_transcription_empty",
  "invalid_scenario",
  "trailer_decisions_invalid",
  "attempt_invalid",
  "timeout",
]);

// 3회 실패가 사용자에게 보이는 상태로 이어지는 규칙은 이 표 한 곳에 둔다.
const FAILURE_OWNER_MAPPINGS: Partial<
  Record<JobKind, FailureOwnerMapping>
> = {
  score_trailer_attempt: { table: "trailer_attempts", references: [{ payloadKey: "attemptId", column: "id" }], write: "update", values: (_id, errorCode) => ({ status: "failed", status_reason: errorCode }) },
  generate_trailer: { table: "trailers", references: [{ payloadKey: "trailerId", column: "id" }], write: "update", values: (_id, errorCode) => ({ status: "failed", status_reason: errorCode }) },
  check_trailer_gate: { table: "trailers", references: [{ payloadKey: "trailerId", column: "id" }], write: "update", values: (_id, errorCode) => ({ status: "failed", status_reason: errorCode }) },
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
  notion_discover: {
    table: "notion_roots",
    references: [{ payloadKey: "rootId", column: "id" }],
    write: "update",
    values: (_rootId, errorCode) => ({ state: "failed", last_error: errorCode }),
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
  run_agent_role: {
    table: "agent_role_results",
    references: [{ payloadKey: "resultId", column: "id" }],
    write: "update",
    values: (_resultId, errorCode) => ({ status: "failed", status_reason: errorCode }),
  },
  run_sales_review: {
    table: "sales_review_tasks",
    references: [{ payloadKey: "taskId", column: "id" }],
    write: "update",
    values: (_taskId, errorCode) => ({ status: "failed", status_reason: errorCode, result: null, updated_at: new Date().toISOString() }),
  },
  run_sales_source_review: {
    table:"sales_source_reviews",references:[{payloadKey:"taskId",column:"id"}],write:"update",
    values:(_id,errorCode)=>({status:"failed",status_reason:errorCode,result:null,updated_at:new Date().toISOString()}),
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

function retryAt(attempts: number, error?: unknown): string {
  const exponentialDelay = RETRY_BASE_DELAY_MS * 2 ** Math.max(1, attempts);
  const jitter = Math.floor(Math.random() * RETRY_JITTER_MS);
  const requested = error && typeof error === "object" ? Reflect.get(error, "retryAfterSeconds") : null;
  const serverDelay = typeof requested === "number" && Number.isFinite(requested) ? Math.min(3600, Math.max(0, requested)) * 1000 : 0;
  return new Date(Date.now() + Math.max(exponentialDelay, serverDelay) + jitter).toISOString();
}

function requestedRetryAfter(error: unknown): number | null {
  const requested = error && typeof error === "object"
    ? Reflect.get(error, "retryAfterSeconds")
    : null;
  return typeof requested === "number" && Number.isFinite(requested)
    ? Math.min(3600, Math.max(0, requested))
    : null;
}

function isExpiredBulkRateLimit(job: JobRow, error: unknown): boolean {
  if (job.lane !== "bulk" || requestedRetryAfter(error) === null) return false;
  const createdAt = Date.parse(job.created_at);
  return Number.isFinite(createdAt) && Date.now() - createdAt >= BULK_RATE_LIMIT_WINDOW_MS;
}

function defaultLane(kind: JobKind): JobLane {
  return ["notion_discover", "notion_poll", "embed_batch"].includes(kind)
    ? "bulk"
    : "realtime";
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
  if (["classify", "embed", "make_card"].includes(job.kind)) {
    const result = await client.rpc("fail_source_job", { p_job: job.id });
    if (result.error) throw new JobWorkerDatabaseError();
    return;
  }
  const mapping = FAILURE_OWNER_MAPPINGS[job.kind as JobKind];
  if (!mapping) {
    return;
  }

  const reference = ownerReference(mapping, job.payload);
  if (!reference) {
    return;
  }

  const values = mapping.values(reference.id, errorCode);
  if(mapping.table==="sales_source_reviews") {
    const result=await client.from("sales_source_reviews").update(values).eq(reference.column,reference.id).in("status",["queued","processing"]);
    if(result.error) throw new JobWorkerDatabaseError();
    return;
  }
  if (mapping.table === "trailer_attempts") {
    const result = await client.from("trailer_attempts").update(values).eq(reference.column, reference.id).eq("status", "scoring");
    if (result.error) throw new JobWorkerDatabaseError();
    return;
  }
  if (mapping.table === "trailers") {
    const result = await client.from("trailers").update(values).eq(reference.column, reference.id).in("status", ["generating", "checking"]);
    if (result.error) throw new JobWorkerDatabaseError();
    return;
  }
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

export async function sweepPendingRows(): Promise<void> {
  // Retention continues even when the public invite feature is switched off.
  const kstDay = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await enqueue("purge_trailer_invites", {}, { dedupeKey: kstDay });
  const client = createServiceSupabaseClient();
  const inviteSweep = await client.rpc("sweep_trailer_invite_attempts");
  if (inviteSweep.error) throw new JobWorkerDatabaseError();
  if (trailerScoresMode() !== "off") {
    const attempts = await client.from("trailer_attempts").update({ status: "failed", status_reason: "timeout" }).eq("status", "scoring").lt("updated_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
    if (attempts.error) throw new JobWorkerDatabaseError();
  }
  if (trailerPublishEnabled()) {
    const trailers = await client.from("trailers").update({ status: "failed", status_reason: "timeout" }).in("status", ["generating", "checking"]).lt("updated_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
    if (trailers.error) throw new JobWorkerDatabaseError();
  }
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

  // 역할 실행은 한 번에 최대 20건이 순차 처리되고 같은 행을 재실행하므로,
  // 생성 시각이 아니라 마지막 요청 시각(updated_at) 기준으로 더 길게 기다린다.
  const agentRoleResult = await client
    .from("agent_role_results")
    .update({ status: "failed", status_reason: "llm_timeout", updated_at: new Date().toISOString() })
    .eq("status", "processing")
    .lt("updated_at", new Date(Date.now() - AGENT_ROLE_SWEEP_TIMEOUT_MS).toISOString());

  if (agentRoleResult.error) {
    throw new JobWorkerDatabaseError();
  }

  const salesReviewResult = await client
    .from("sales_review_tasks")
    .update({ status: "failed", status_reason: "llm_timeout", result: null, updated_at: new Date().toISOString() })
    .in("status", ["queued", "processing"])
    .lt("updated_at", cutoff);
  if (salesReviewResult.error) throw new JobWorkerDatabaseError();

  const salesSourceResult=await client.from("sales_source_reviews")
    .update({status:"failed",status_reason:"llm_timeout",result:null,updated_at:new Date().toISOString()})
    .in("status",["queued","processing"]).lt("updated_at",cutoff);
  if(salesSourceResult.error) throw new JobWorkerDatabaseError();

  const cardResult = await client
    .from("decision_requests")
    .update({ status: "needs_review" })
    .eq("status", "pending")
    .lt("opened_at", cutoff);

  if (cardResult.error) {
    throw new JobWorkerDatabaseError();
  }
  if (process.env.SASU_RETRO_ENABLED === "true") {
    const retro = await client.rpc("sweep_retro_drafts");
    if (retro.error) throw new JobWorkerDatabaseError();
  }

}

export async function enqueue(
  kind: JobKind,
  payload: unknown,
  opts?: { dedupeKey?: string; runAfter?: Date; lane?: JobLane },
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
      lane: opts?.lane ?? defaultLane(kind),
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
  lane: JobLane = "realtime",
): Promise<{ claimed: number; done: number; failed: number }> {
  const claimLimit = Math.min(
    MAX_CLAIM_LIMIT,
    Math.max(1, Math.trunc(limit)),
  );
  const client = createServiceSupabaseClient();
  const { data, error } = await client.rpc("claim_jobs", {
    p_limit: claimLimit,
    p_lane: lane,
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
        lease_until: null,
        updated_at: new Date().toISOString(),
      });
      failed += 1;
      continue;
    }

    const notionJob = ["notion_import", "notion_discover", "notion_poll"].includes(job.kind);
    if (notionJob) {
      const lease = await client.rpc("acquire_notion_job_lease", { p_job: job.id });
      if (lease.error) throw new JobWorkerDatabaseError();
      if (lease.data !== true) {
        await updateJob(client, job.id, {
          status: "queued",
          attempts: Math.max(0, job.attempts - 1),
          run_after: new Date(Date.now() + NOTION_LEASE_RETRY_MS).toISOString(),
          lease_until: null,
          updated_at: new Date().toISOString(),
        });
        continue;
      }
    }

    let handlerResult: JobHandlerResult = undefined;
    let handlerError: unknown;
    let handlerFailed = false;
    try {
      handlerResult = await withSlackJob(client, job.id, job.kind, () =>
        notionJob
          ? withNotionForJob(client, job.id, () => handler(job.payload))
          : handler(job.payload),
      );
    } catch (error) {
      handlerFailed = true;
      handlerError = error;
    } finally {
      if (notionJob) {
        const released = await client.rpc("release_notion_job_lease", { p_job: job.id });
        if (released.error) throw new JobWorkerDatabaseError();
      }
    }

    if (handlerFailed) {
      const errorCode = sanitizeErrorCode(handlerError);

      if (job.lane === "bulk" && requestedRetryAfter(handlerError) !== null) {
        if (isExpiredBulkRateLimit(job, handlerError)) {
          await updateFailureOwner(client, job, errorCode);
          await updateJob(client, job.id, {
            status: "failed",
            last_error: errorCode,
            lease_until: null,
            updated_at: new Date().toISOString(),
          });
          failed += 1;
          continue;
        }
        await updateJob(client, job.id, {
          status: "queued",
          attempts: Math.max(0, job.attempts - 1),
          run_after: retryAt(0, handlerError),
          last_error: errorCode,
          lease_until: null,
          updated_at: new Date().toISOString(),
        });
        continue;
      }

      if (job.attempts >= MAX_ATTEMPTS) {
        await updateFailureOwner(client, job, errorCode);
        await updateJob(client, job.id, {
          status: "failed",
          last_error: errorCode,
          lease_until: null,
          updated_at: new Date().toISOString(),
        });
        failed += 1;
        continue;
      }

      await updateJob(client, job.id, {
        status: "queued",
        run_after: retryAt(job.attempts, handlerError),
        last_error: errorCode,
        lease_until: null,
        updated_at: new Date().toISOString(),
      });
      continue;
    }
    // 처리 성공 뒤 완료 기록 실패는 외부 작업의 실패가 아니다.
    // 자동 재큐잉하지 않고 오류를 상위로 전달해 중복 실행을 피한다.
    // 이 경우 lease 만료 뒤 동일 job이 회수될 수 있으므로 handler는 멱등이어야 한다.
    if (job.kind === "embed_batch") {
      const completed = await client.rpc("complete_embed_batch_job", {
        p_job: job.id,
        p_requeue: handlerResult?.requeue === true,
      });
      if (completed.error || !["done", "queued"].includes(String(completed.data))) {
        throw new JobWorkerDatabaseError();
      }
    } else {
      await updateJob(client, job.id, {
        status: "done",
        last_error: null,
        lease_until: null,
        updated_at: new Date().toISOString(),
      });
    }
    done += 1;
  }

  return { claimed: jobs.length, done, failed };
}

export function kickWorker(): void {
  // 동적 import로 jobs ↔ 파이프라인의 초기화 순환을 피한다.
  after(async () => {
    const { runWorkerOnce } = await import("@/lib/worker");
    return runWorkerOnce();
  });
}

registerHandler("sweep", sweepPendingRows);
