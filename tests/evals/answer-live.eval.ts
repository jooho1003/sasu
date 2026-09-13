import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";

const cases = [
  { id: "A01", question: "최대 할인율은 얼마인가요?", evidence: "표준 계약의 최대 할인율은 10%입니다.", refused: false, expected: "10%" },
  { id: "A02", question: "무료 체험은 며칠인가요?", evidence: "무료 체험 기간은 14일입니다.", refused: false, expected: "14" },
  { id: "A03", question: "주문 최소 수량은 몇 개인가요?", evidence: "주문 최소 수량은 80개입니다.", refused: false, expected: "80" },
  { id: "A04", question: "리뷰 담당 부서는 어디인가요?", evidence: "신규 계약의 최종 리뷰 담당 부서는 재무팀입니다.", refused: false, expected: "재무팀" },
  { id: "A05", question: "고객사의 내년 매출 목표는 얼마인가요?", evidence: "회의실 예약 담당은 운영팀입니다.", refused: true, expected: "" },
  { id: "A06", question: "배포 정책을 알려주세요.", evidence: "", refused: true, expected: "" },
];
const state = vi.hoisted(() => ({ client: null as unknown, evidence: "", itemId: "", row: {} as Record<string, unknown> }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => state.client }));
vi.mock("@/lib/jobs", () => ({ registerHandler: vi.fn() }));
vi.mock("@/lib/embeddings", () => ({ embedText: async () => ({ vector: [0.1] }) }));
vi.mock("@/lib/search", () => ({
  searchAs: async () => state.evidence ? [{ id: state.itemId, content: state.evidence, source_kind: "document", source_visibility: "dept" }] : [],
  recentDecisionsAs: async () => [],
}));
vi.mock("@/lib/slack/post", () => ({ postMessage: () => { throw new Error("Live evaluation must not send Slack messages"); } }));
import { answerQuestion } from "@/lib/pipeline/answer";

const rows: Record<string, unknown>[] = [];
let saved: Record<string, unknown> = {};
let calls = 0;
let inputTokens = 0;
let outputTokens = 0;
beforeAll(async () => {
  loadEnvConfig(process.cwd());
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is required");
  const actual = await vi.importActual<typeof import("@/lib/supabase/service")>("@/lib/supabase/service");
  const telemetry = actual.createServiceSupabaseClient();
  state.client = {
    from(table: string) {
      if (table === "llm_calls") return { insert: async (row: { input_tokens: number; output_tokens: number }) => {
        calls += 1; inputTokens += row.input_tokens ?? 0; outputTokens += row.output_tokens ?? 0;
        return telemetry.from("llm_calls").insert(row);
      } };
      if (table !== "answers") throw new Error("Unexpected evaluation table");
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: state.row, error: null }) };
      return query;
    },
    rpc(name: string, args: Record<string, unknown>) {
      if (name !== "complete_answer") throw new Error("Unexpected evaluation RPC");
      saved = args;
      return Promise.resolve({ data: true, error: null });
    },
  };
});
it.each(cases.map(row => ({ id: row.id, row })))("$id", async ({ row }) => {
  state.evidence = row.evidence;
  state.itemId = `synthetic-${row.id}`;
  state.row = { id: row.id, question: row.question, asked_by: "synthetic-user", status: "pending" };
  saved = {};
  const before = calls;
  const started = performance.now();
  await answerQuestion(row.id);
  const citations = (saved.p_citations ?? []) as { item_id: string; quote: string }[];
  const citationValid = citations.every(c => c.item_id === state.itemId && c.quote.length > 0 && row.evidence.includes(c.quote));
  const factPresent = row.refused || String(saved.p_answer).replace(/\s/g, "").includes(row.expected);
  const correct = saved.p_refused === row.refused && citationValid && factPresent && (row.refused || citations.length > 0);
  rows.push({ id: row.id, correct, expectedRefused: row.refused, actualRefused: saved.p_refused, citationValid, factPresent, calls: calls - before, durationMs: Math.round(performance.now() - started) });
  expect(correct).toBe(true);
});
afterAll(() => {
  const report = { generatedAt: new Date().toISOString(), synthetic: true, independentlyReviewed: false,
    scope: "actual answerQuestion + Groq; retrieval/embedding/persistence mocked; telemetry attempted; no Slack sends",
    model: "openai/gpt-oss-120b", total: rows.length, passed: rows.filter(row => row.correct).length, calls, inputTokens, outputTokens, rows };
  mkdirSync("docs/verification/evaluation-results", { recursive: true });
  writeFileSync("docs/verification/evaluation-results/answer-live.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ total: rows.length, passed: report.passed, calls }));
});
