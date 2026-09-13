import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
import { teams, teamAnswerCases, teamClassificationCases } from "@/fixtures/evaluation/team-workflows";

const state = vi.hoisted(() => ({ client: null as unknown, enqueue: vi.fn(), evidence: "", itemId: "" }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => state.client }));
vi.mock("@/lib/jobs", () => ({ enqueue: state.enqueue, registerHandler: vi.fn() }));
vi.mock("@/lib/embeddings", () => ({ embedText: async () => ({ vector: [0.1] }) }));
vi.mock("@/lib/search", () => ({
  searchAs: async () => state.evidence ? [{ id: state.itemId, content: state.evidence, source_kind: "document", source_visibility: "dept" }] : [],
  recentDecisionsAs: async () => [],
}));
vi.mock("@/lib/slack/post", () => ({ postMessage: () => { throw new Error("No Slack in team evaluation"); } }));
import { classifyItem } from "@/lib/pipeline/classify";
import { answerQuestion } from "@/lib/pipeline/answer";

let item: Record<string, unknown> = {};
let answer: Record<string, unknown> = {};
let saved: Record<string, unknown> = {};
let classification: Record<string, unknown> = {};
const telemetry: { model: string; input_tokens: number; output_tokens: number }[] = [];
const results: Record<string, unknown>[] = [];
beforeAll(() => {
  loadEnvConfig(process.cwd());
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY required");
  // All persistence including llm_calls is in memory. Real model is the only external call.
  state.client = {
    from(table: string) {
      if (table === "llm_calls") return { insert: async (row: typeof telemetry[number]) => { telemetry.push(row); return { error: null }; } };
      if (table === "classifications") return { upsert: async (row: Record<string, unknown>) => { classification = row; return { error: null }; } };
      if (!["items", "answers"].includes(table)) throw new Error("Unexpected evaluation table");
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === "items" ? item : answer, error: null }) };
      return query;
    },
    rpc(name: string, args: Record<string, unknown>) {
      if (name !== "complete_answer") throw new Error("Unexpected evaluation RPC");
      saved = args;
      return Promise.resolve({ data: true, error: null });
    },
  };
});
it.each(teamClassificationCases)("분류 $id $team", async row => {
  item = { content: row.text, dept_id: row.team, deleted_at: null, spoken_at: "2026-09-12T01:00:00Z", created_at: "2026-09-12T01:00:00Z" };
  classification = {};
  state.enqueue.mockClear();
  const started = performance.now();
  try {
    await classifyItem(row.id);
    const promoted = state.enqueue.mock.calls.some(([kind]) => kind === "make_card");
    const correct = classification.label === row.label;
    const safePromotion = row.label === "decision" || !promoted;
    results.push({ id: row.id, team: row.team, kind: "classification", expected: row.label, actual: classification.label, correct, promoted, safePromotion, durationMs: Math.round(performance.now() - started) });
    expect(correct && safePromotion).toBe(true);
  } catch (error) {
    if (!results.some(r => r.id === row.id)) results.push({ id: row.id, team: row.team, kind: "classification", correct: false, error: error instanceof Error ? error.name : "unknown" });
    throw error;
  }
});
it.each(teamAnswerCases)("답변 $id $team", async row => {
  state.evidence = row.evidence;
  state.itemId = `evidence-${row.id}`;
  answer = { id: row.id, dept_id: row.team, asked_by: "synthetic-user", status: "pending", question: row.question };
  saved = {};
  const started = performance.now();
  const callsBefore = telemetry.length;
  try {
    await answerQuestion(row.id);
    const citations = (saved.p_citations ?? []) as { item_id: string; quote: string }[];
    const citationValid = citations.every(c => c.item_id === state.itemId && c.quote.length > 0 && row.evidence.includes(c.quote));
    const text = String(saved.p_answer);
    const factPresent = row.refused || text.replace(/\s/g, "").includes(row.expected);
    const forbiddenAbsent = row.forbidden.every(term => !text.includes(term));
    const correct = saved.p_refused === row.refused && citationValid && factPresent && forbiddenAbsent && (row.refused ? citations.length === 0 : citations.length > 0);
    results.push({ id: row.id, team: row.team, kind: "answer", correct, expectedRefused: row.refused, actualRefused: saved.p_refused, citationValid, factPresent, forbiddenAbsent, answer: text, citations, calls: telemetry.length - callsBefore, durationMs: Math.round(performance.now() - started) });
    expect(correct).toBe(true);
  } catch (error) {
    if (!results.some(r => r.id === row.id)) results.push({ id: row.id, team: row.team, kind: "answer", correct: false, error: error instanceof Error ? error.name : "unknown" });
    throw error;
  }
});
afterAll(() => {
  const summary = teams.map(team => {
    const rows = results.filter(r => r.team === team);
    const classification = rows.filter(r => r.kind === "classification");
    const tp = classification.filter(r => r.expected === "decision" && r.actual === "decision").length;
    const predicted = classification.filter(r => r.actual === "decision").length;
    return { team, total: rows.length, passed: rows.filter(r => r.correct).length,
      classificationPassed: classification.filter(r => r.correct).length,
      answerPassed: rows.filter(r => r.kind === "answer" && r.correct).length,
      decisionRecall: tp / 4, decisionPrecision: predicted ? tp / predicted : null,
      promotedDecisions: classification.filter(r => r.expected === "decision" && r.promoted).length,
      falsePromotions: classification.filter(r => r.expected !== "decision" && r.promoted).length };
  });
  const report = { generatedAt: new Date().toISOString(), synthetic: true, independentlyReviewed: false,
    scope: "production classifyItem + answerQuestion with actual Groq; all DB/search/embedding/jobs/Slack/telemetry persistence mocked; not RAG or browser end-to-end",
    total: results.length, passed: results.filter(r => r.correct).length, summary,
    calls: telemetry.length, inputTokens: telemetry.reduce((s, r) => s + (r.input_tokens ?? 0), 0), outputTokens: telemetry.reduce((s, r) => s + (r.output_tokens ?? 0), 0), results };
  mkdirSync("docs/verification/evaluation-results", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(`docs/verification/evaluation-results/team-workflows-${stamp}.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ summary, calls: telemetry.length }));
});
