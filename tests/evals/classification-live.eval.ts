import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { classificationCases } from "@/fixtures/evaluation/classification";

const state = vi.hoisted(() => ({
  client: null as unknown,
  enqueue: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => state.client }));
vi.mock("@/lib/jobs", () => ({ enqueue: state.enqueue, registerHandler: vi.fn() }));

import { classifyItem } from "@/lib/pipeline/classify";
import { classifyByRules } from "@/lib/rules";

let current = classificationCases[0];
let classification: Record<string, unknown> = {};
const results: Record<string, unknown>[] = [];
const telemetry: { model: string; input_tokens: number; output_tokens: number }[] = [];

beforeAll(async () => {
  loadEnvConfig(process.cwd());
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is required for live evaluation");
  const actual = await vi.importActual<typeof import("@/lib/supabase/service")>("@/lib/supabase/service");
  const telemetryClient = actual.createServiceSupabaseClient();
  state.client = {
    rpc: async (_name: string, args: { p_values: Record<string, unknown> }) => { classification = args.p_values; return { data: true, error: null }; },
    from(table: string) {
      if (table === "llm_calls") return { insert: async (row: { model: string; input_tokens: number; output_tokens: number }) => {
        telemetry.push(row);
        return telemetryClient.from("llm_calls").insert(row);
      } };
      if (table === "classifications") return { upsert: async (row: Record<string, unknown>) => {
        classification = row;
        return { error: null };
      } };
      if (table === "items") {
        const query = { select: () => query, eq: () => query, maybeSingle: async () => ({
          data: { content_version: 1, content: current.text, spoken_at: "2026-09-12T01:00:00.000Z", created_at: "2026-09-12T01:00:00.000Z", deleted_at: null }, error: null,
        }) };
        return query;
      }
      throw new Error(`Unexpected evaluation table: ${table}`);
    },
  };
});

it.each(classificationCases.map(row => ({ id: row.id, row })))("$id", async ({ row }) => {
  current = row;
  classification = {};
  state.enqueue.mockClear();
  const started = performance.now();
  const callsBefore = telemetry.length;
  await classifyItem(row.id);
  results.push({
    id: row.id, split: row.split, expected: row.label, actual: classification.label,
    correct: classification.label === row.label,
    candidate: classifyByRules({ content: row.text, spokenAt: new Date("2026-09-12T01:00:00.000Z") }).isDecisionCandidate,
    method: classification.method, llmCalls: telemetry.length - callsBefore,
    autoPromoted: state.enqueue.mock.calls.some(([kind]) => kind === "make_card"),
    durationMs: Math.round(performance.now() - started),
  });
  expect(classification.label).toBe(row.label);
});

afterAll(() => {
  const baseline = JSON.parse(readFileSync("docs/verification/evaluation-results/classification-live.json", "utf8")) as {
    generatedAt: string; inputTokens: number; outputTokens: number; llmCalls: number;
    results: { id: string; correct: boolean; actual: string; durationMs: number }[];
  };
  const baselineById = new Map(baseline.results.map(row => [row.id, row]));
  const summary = ["all", "development", "holdout"].map(split => {
    const rows = results.filter(row => split === "all" || row.split === split);
    const tp = rows.filter(row => row.expected === "decision" && row.actual === "decision").length;
    const predicted = rows.filter(row => row.actual === "decision").length;
    const expected = rows.filter(row => row.expected === "decision").length;
    return { split, total: rows.length, correct: rows.filter(row => row.correct).length,
      decisionPrecision: predicted ? tp / predicted : null,
      decisionRecall: expected ? tp / expected : null,
      candidateRecall: expected ? rows.filter(row => row.expected === "decision" && row.candidate).length / expected : null,
    };
  });
  const report = { generatedAt: new Date().toISOString(), synthetic: true, independentlyReviewed: false,
    version: "semantic-v2", baselineGeneratedAt: baseline.generatedAt,
    comparison: {
      correctedIds: results.filter(row => baselineById.get(String(row.id))?.correct === false && row.correct).map(row => row.id),
      regressedIds: results.filter(row => baselineById.get(String(row.id))?.correct === true && !row.correct).map(row => row.id),
      baselineLlmCalls: baseline.llmCalls, baselineInputTokens: baseline.inputTokens, baselineOutputTokens: baseline.outputTokens,
      baselineTotalDurationMs: baseline.results.reduce((sum, row) => sum + row.durationMs, 0),
      totalDurationMs: results.reduce((sum, row) => sum + Number(row.durationMs), 0),
    },
    pipeline: "production classifyItem; items/classifications/jobs mocked; real llm.structured; llm_calls telemetry attempted",
    sampleCount: results.length, summary, llmCalls: telemetry.length,
    models: [...new Set(telemetry.map(row => row.model))],
    inputTokens: telemetry.reduce((sum, row) => sum + (row.input_tokens ?? 0), 0),
    outputTokens: telemetry.reduce((sum, row) => sum + (row.output_tokens ?? 0), 0),
    results,
  };
  mkdirSync("docs/verification/evaluation-results", { recursive: true });
  writeFileSync("docs/verification/evaluation-results/classification-semantic-v2.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ summary, llmCalls: telemetry.length }));
});
