import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const moduleMocks = vi.hoisted(() => ({
  after: vi.fn(),
  createServiceSupabaseClient: vi.fn(),
  runWorkerOnce: vi.fn(),
}));

vi.mock("next/server", () => ({ after: moduleMocks.after }));
vi.mock("@/lib/worker", () => ({ runWorkerOnce: moduleMocks.runWorkerOnce }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: moduleMocks.createServiceSupabaseClient,
}));

import {
  enqueue,
  kickWorker,
  registerHandler,
  runOnce,
} from "@/lib/jobs";

type ClaimedJob = {
  id: string;
  kind: string;
  payload: unknown;
  attempts: number;
};

type Filter = { operator: "eq" | "lt" | "in"; column: string; value: unknown };
type Operation = {
  table: string;
  method: "insert" | "update" | "upsert";
  values: unknown;
  filters: Filter[];
};

type DbResult = { data: unknown; error: null };
type QueryBuilder = Promise<DbResult> & {
  in: (column: string, value: unknown) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  lt: (column: string, value: unknown) => QueryBuilder;
  select: (columns?: string) => QueryBuilder;
  single: () => QueryBuilder;
};

function makeBuilder(operation: Operation, data: unknown = null): QueryBuilder {
  const builder = Promise.resolve({ data, error: null }) as QueryBuilder;
  builder.in = (column, value) => { operation.filters.push({ operator: "in", column, value }); return builder; };

  builder.eq = (column, value) => {
    operation.filters.push({ operator: "eq", column, value });
    return builder;
  };
  builder.lt = (column, value) => {
    operation.filters.push({ operator: "lt", column, value });
    return builder;
  };
  builder.select = () => builder;
  builder.single = () => builder;

  return builder;
}

function createFakeClient(claims: ClaimedJob[][] = []) {
  const operations: Operation[] = [];
  const rpc = vi.fn(async () => ({
    data: claims.shift() ?? [],
    error: null,
  }));
  const from = vi.fn((table: string) => ({
    insert: (values: unknown) => {
      const operation: Operation = {
        table,
        method: "insert",
        values,
        filters: [],
      };
      operations.push(operation);
      return makeBuilder(operation, { id: "inserted-job-id" });
    },
    update: (values: unknown) => {
      const operation: Operation = {
        table,
        method: "update",
        values,
        filters: [],
      };
      operations.push(operation);
      return makeBuilder(operation);
    },
    upsert: (values: unknown) => {
      const operation: Operation = {
        table,
        method: "upsert",
        values,
        filters: [],
      };
      operations.push(operation);
      return makeBuilder(operation);
    },
  }));

  return { client: { from, rpc }, operations, rpc };
}

function jobUpdate(operations: Operation[], status: string): Operation {
  const operation = operations.find(
    (candidate) =>
      candidate.table === "jobs" &&
      candidate.method === "update" &&
      (candidate.values as { status?: string }).status === status,
  );

  expect(operation).toBeDefined();
  return operation as Operation;
}

describe("jobs worker", () => {
  it("채점 3회 실패와 10분 스윕은 사용자 실패 상태로 이어진다", async () => {
    vi.stubEnv("SASU_TRAILER_SCORES_MODE", "scores");
    const fake=createFakeClient([[{id:"score-job",kind:"score_trailer_attempt",payload:{attemptId:"a"},attempts:3}]]);moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    registerHandler("score_trailer_attempt",async()=>{throw Object.assign(new Error("attempt_invalid"),{error_code:"attempt_invalid"});});await runOnce();
    expect(fake.operations.some(o=>o.table==="trailer_attempts"&&(o.values as Record<string,unknown>).status_reason==="attempt_invalid")).toBe(true);
    const {sweepPendingRows}=await import("@/lib/jobs"); await sweepPendingRows();expect(fake.operations.some(o=>o.table==="trailer_attempts"&&o.filters.some(f=>f.column==="updated_at"&&f.operator==="lt"))).toBe(true);
  });
  beforeEach(() => {
    moduleMocks.after.mockReset();
    moduleMocks.createServiceSupabaseClient.mockReset();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("실패한 job은 attempts 증가와 함께 run_after가 지수적으로 뒤로 밀린다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:00:00.000Z"));
    const fake = createFakeClient([
      [
        {
          id: "job-1",
          kind: "send_slack",
          payload: {},
          attempts: 1,
        },
      ],
      [
        {
          id: "job-1",
          kind: "send_slack",
          payload: {},
          attempts: 2,
        },
      ],
    ]);
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    registerHandler("send_slack", async () => {
      throw new Error("원문: 외주사 B 비밀 견적");
    });

    await runOnce();
    await runOnce();

    const retries = fake.operations.filter(
      (operation) =>
        operation.table === "jobs" &&
        operation.method === "update" &&
        (operation.values as { status?: string }).status === "queued",
    );

    expect(fake.rpc).toHaveBeenCalledTimes(2);
    expect(retries).toHaveLength(2);
    expect(retries.map((operation) => operation.values)).toEqual([
      expect.objectContaining({
        last_error: "job_failed",
        lease_until: null,
        run_after: "2026-09-08T12:00:02.000Z",
      }),
      expect.objectContaining({
        last_error: "job_failed",
        lease_until: null,
        run_after: "2026-09-08T12:00:04.000Z",
      }),
    ]);
  });

  it.each([
    {
      kind: "classify" as const,
      payload: { itemId: "item-1" },
      ownerTable: "classifications",
      ownerStatus: { item_id: "item-1", label: "unclassified" },
    },
    {
      kind: "embed" as const,
      payload: { itemId: "item-1" },
      ownerTable: "items",
      ownerStatus: { embed_status: "failed" },
    },
    {
      kind: "make_card" as const,
      payload: { requestId: "request-1" },
      ownerTable: "decision_requests",
      ownerStatus: { status: "needs_review" },
    },
    {
      kind: "answer" as const,
      payload: { answerId: "answer-1" },
      ownerTable: "answers",
      ownerStatus: { status: "failed", error_code: "llm_timeout" },
    },
    {
      kind: "send_slack" as const,
      payload: { requestId: "request-1" },
      ownerTable: "decision_requests",
      ownerStatus: {
        slack_delivery_status: "failed",
        slack_delivery_error: "llm_timeout",
      },
    },
    {
      kind: "run_agent_role" as const,
      payload: { resultId: "result-1" },
      ownerTable: "agent_role_results",
      ownerStatus: { status: "failed", status_reason: "llm_timeout" },
    },
  ])(
    "3회 실패한 $kind job은 failed이고 소유 row 상태도 바뀐다",
    async ({ kind, payload, ownerTable, ownerStatus }) => {
      const fake = createFakeClient([
        [{ id: `${kind}-job`, kind, payload, attempts: 3 }],
      ]);
      moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
      registerHandler(kind, async () => {
        throw { error_code: "llm_timeout", message: "민감한 원문" };
      });

      const result = await runOnce();

      expect(result).toEqual({ claimed: 1, done: 0, failed: 1 });
      expect(jobUpdate(fake.operations, "failed").values).toEqual(
        expect.objectContaining({ last_error: "llm_timeout", lease_until: null }),
      );
      expect(
        fake.operations.some(
          (operation) =>
            operation.table === ownerTable &&
            Object.entries(ownerStatus).every(
              ([key, value]) =>
                (operation.values as Record<string, unknown>)[key] === value,
            ),
        ),
      ).toBe(true);
    },
  );

  it("등록되지 않은 kind는 unknown_kind로 즉시 failed가 된다", async () => {
    const fake = createFakeClient([
      [{ id: "job-unknown", kind: "not_a_real_kind", payload: {}, attempts: 1 }],
    ]);
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);

    const result = await runOnce();

    expect(result).toEqual({ claimed: 1, done: 0, failed: 1 });
    expect(jobUpdate(fake.operations, "failed").values).toEqual(
      expect.objectContaining({ last_error: "unknown_kind", lease_until: null }),
    );
  });

  it("성공한 job은 완료 기록과 함께 lease를 해제한다", async () => {
    const fake = createFakeClient([
      [{ id: "completed", kind: "send_slack", payload: {}, attempts: 1 }],
    ]);
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    registerHandler("send_slack", async () => undefined);

    await expect(runOnce()).resolves.toEqual({ claimed: 1, done: 1, failed: 0 });

    expect(jobUpdate(fake.operations, "done").values).toEqual(
      expect.objectContaining({ lease_until: null }),
    );
  });

  it("발행 플래그가 꺼져 있으면 미적용 예고편 테이블을 조회하지 않는다", async () => {
    vi.stubEnv("SASU_TRAILER_PUBLISH_ENABLED", "false");
    const fake = createFakeClient([[{ id: "sweep-trailer", kind: "sweep", payload: {}, attempts: 1 }]]);
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    await runOnce();
    expect(fake.operations.some((operation) => operation.table === "trailers")).toBe(false);
    vi.unstubAllEnvs();
  });

  it("예고편의 생성·검사는 updated_at 기준 10분 후 timeout으로 끝낸다", async () => {
    vi.stubEnv("SASU_TRAILER_PUBLISH_ENABLED", "true"); vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:20:00Z"));
    const fake = createFakeClient([[{ id: "sweep-trailer", kind: "sweep", payload: {}, attempts: 1 }]]);
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    await runOnce();
    const operation = fake.operations.find((op) => op.table === "trailers");
    expect(operation?.values).toEqual({ status: "failed", status_reason: "timeout" });
    expect(operation?.filters).toContainEqual({ operator: "in", column: "status", value: ["generating", "checking"] });
    expect(operation?.filters).toContainEqual({ operator: "lt", column: "updated_at", value: "2026-09-15T12:10:00.000Z" });
    vi.unstubAllEnvs();
  });

  it("sweep은 2분 넘은 pending answers를 failed(llm_timeout)로 바꾼다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:05:00.000Z"));
    const fake = createFakeClient([
      [{ id: "sweep-job", kind: "sweep", payload: {}, attempts: 1 }],
    ]);
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);

    const result = await runOnce();

    expect(result).toEqual({ claimed: 1, done: 1, failed: 0 });
    expect(fake.operations).toContainEqual(
      expect.objectContaining({
        table: "answers",
        method: "update",
        values: expect.objectContaining({
          status: "failed",
          error_code: "llm_timeout",
        }),
        filters: expect.arrayContaining([
          { operator: "eq", column: "status", value: "pending" },
          {
            operator: "lt",
            column: "created_at",
            value: "2026-09-08T12:03:00.000Z",
          },
        ]),
      }),
    );
    expect(fake.operations).toContainEqual(
      expect.objectContaining({
        table: "decision_requests",
        values: expect.objectContaining({ status: "needs_review" }),
      }),
    );
  });

  it("sweep은 역할 결과를 재실행 시각(updated_at) 기준 20분이 지나야 failed로 바꾼다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:30:00.000Z"));
    const fake = createFakeClient([
      [{ id: "sweep-job", kind: "sweep", payload: {}, attempts: 1 }],
    ]);
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);

    await runOnce();

    const operation = fake.operations.find(
      (candidate) => candidate.table === "agent_role_results" && candidate.method === "update",
    );
    expect(operation?.values).toEqual(
      expect.objectContaining({ status: "failed", status_reason: "llm_timeout" }),
    );
    expect(operation?.filters).toEqual(
      expect.arrayContaining([
        { operator: "eq", column: "status", value: "processing" },
        { operator: "lt", column: "updated_at", value: "2026-09-08T12:10:00.000Z" },
      ]),
    );
    expect(operation?.filters).not.toContainEqual(
      expect.objectContaining({ column: "created_at" }),
    );
  });

  it("last_error에는 원문이 아니라 허용된 에러 코드만 기록한다", async () => {
    const fake = createFakeClient([
      [
        {
          id: "job-sensitive-error",
          kind: "notion_import",
          payload: {},
          attempts: 3,
        },
      ],
    ]);
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    registerHandler("notion_import", async () => {
      throw new Error("고객 질문 원문과 슬랙 이벤트 본문");
    });

    await runOnce();

    const values = jobUpdate(fake.operations, "failed").values as {
      last_error: string;
    };
    expect(values.last_error).toBe("job_failed");
    expect(values.last_error).not.toContain("고객 질문");
    expect(values.last_error).not.toContain("슬랙 이벤트");
  });

  it("enqueue는 runAfter를 저장하고 생성된 job id를 반환한다", async () => {
    const fake = createFakeClient();
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    const runAfter = new Date("2026-09-08T13:00:00.000Z");

    const id = await enqueue("classify", { itemId: "item-1" }, { runAfter });

    expect(id).toBe("inserted-job-id");
    expect(fake.operations[0]).toEqual(
      expect.objectContaining({
        table: "jobs",
        method: "insert",
        values: expect.objectContaining({
          kind: "classify",
          payload: { itemId: "item-1" },
          run_after: runAfter.toISOString(),
        }),
      }),
    );
  });

  it("kickWorker는 Next.js after에서 공통 워커 진입점을 실행한다", async () => {
    kickWorker();

    expect(moduleMocks.after).toHaveBeenCalledOnce();
    expect(moduleMocks.after).toHaveBeenCalledWith(expect.any(Function));
    await moduleMocks.after.mock.calls[0][0]();
    expect(moduleMocks.runWorkerOnce).toHaveBeenCalledOnce();
  });

  it("작업 성공 후 완료 상태 저장 실패를 작업 실패로 오인해 재큐잉하지 않는다", async () => {
    const fake = createFakeClient([[{ id: "delivered", kind: "send_slack", payload: {}, attempts: 1 }]]);
    const update = vi.fn(() => ({ eq: async () => ({ error: { code: "XX000" }, data: null }) }));
    fake.client.from.mockReturnValue({ update } as unknown as ReturnType<typeof fake.client.from>);
    moduleMocks.createServiceSupabaseClient.mockReturnValue(fake.client);
    const handler = vi.fn(async () => undefined);
    registerHandler("send_slack", handler);
    await expect(runOnce()).rejects.toThrow("database operation failed");
    expect(handler).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "done" }));
  });
});
