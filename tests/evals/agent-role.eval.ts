import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const state = vi.hoisted(() => ({ telemetry: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => ({
    from(table: string) {
      if (table !== "llm_calls") throw new Error("Unexpected evaluation table");
      return {
        insert: async (row: Record<string, unknown>) => {
          state.telemetry.push(row);
          return { error: null };
        },
      };
    },
  }),
}));

import { chunkDocumentText } from "@/lib/adapters/document";
import { AgentRoleDefinition, AgentRoleEvaluation } from "@/lib/contracts";
import {
  buildAgentRolePrompt,
  selectAgentRoleChunks,
  verifyAgentRoleEvaluation,
  weightedScore,
} from "@/lib/agent-role";
import { llm } from "@/lib/llm";

type EvaluationRow = {
  id: string;
  weightedScore: number | null;
  okCount: number;
  dropped: number;
  citationValid: boolean;
  schemaOnly: boolean;
  inputTokens: number;
  outputTokens: number;
};

const fixtureRoot = "tests/evals/fixtures/agent-role";
const role = AgentRoleDefinition.parse(JSON.parse(readFileSync(`${fixtureRoot}/role.json`, "utf8")));
const candidateIds = ["P1", "P2", "P3", "P4"];
const rows: EvaluationRow[] = [];

function hasOnlySchemaKeys(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const rootKeys = Object.keys(value).sort();
  if (rootKeys.join(",") !== "criteria,summary") return false;
  const criteria = Reflect.get(value, "criteria");
  if (!Array.isArray(criteria)) return false;
  return criteria.every((criterion) => {
    if (typeof criterion !== "object" || criterion === null || Array.isArray(criterion)) return false;
    const keys = Object.keys(criterion).sort();
    if (keys.join(",") !== "citations,key,rationale,score") return false;
    const citations = Reflect.get(criterion, "citations");
    return Array.isArray(citations) && citations.every((citation) => {
      if (typeof citation !== "object" || citation === null || Array.isArray(citation)) return false;
      return Object.keys(citation).sort().join(",") === "decision_id,item_id,quote";
    });
  });
}

beforeAll(() => {
  loadEnvConfig(process.cwd());
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is required");
});

it.each(candidateIds)("%s 실제 Groq 기준표 평가", async (id) => {
  const document = readFileSync(`${fixtureRoot}/${id}.txt`, "utf8");
  const chunks = chunkDocumentText(document).map((content, index) => ({ id: `${id}-item-${index + 1}`, content }));
  const selected = selectAgentRoleChunks(chunks);
  const output = await llm.structured(
    "run_agent_role",
    AgentRoleEvaluation,
    buildAgentRolePrompt(role, selected.items),
  );
  const verified = verifyAgentRoleEvaluation(output.data, role, new Map(chunks.map((chunk) => [chunk.id, chunk.content])));
  const citationValid = verified.criteria
    .filter((criterion) => criterion.evidence === "ok")
    .every((criterion) => criterion.citations.every((citation) => citation.item_id !== null && chunks.some((chunk) => chunk.id === citation.item_id && chunk.content.includes(citation.quote))));
  const row: EvaluationRow = {
    id,
    weightedScore: weightedScore(verified.criteria),
    okCount: verified.criteria.filter((criterion) => criterion.evidence === "ok").length,
    dropped: verified.dropped,
    citationValid,
    schemaOnly: hasOnlySchemaKeys(output.data),
    inputTokens: output.meta.inputTokens,
    outputTokens: output.meta.outputTokens,
  };
  rows.push(row);
  expect(row.okCount).toBeGreaterThanOrEqual(1);
  expect(row.citationValid).toBe(true);
  expect(row.schemaOnly).toBe(true);
});

afterAll(() => {
  const p1 = rows.find((row) => row.id === "P1");
  const p2 = rows.find((row) => row.id === "P2");
  const p3 = rows.find((row) => row.id === "P3");
  const p4 = rows.find((row) => row.id === "P4");
  const fairnessDifference = p3?.weightedScore == null || p4?.weightedScore == null
    ? null
    : Math.abs(p3.weightedScore - p4.weightedScore);
  const checks = {
    allHaveEvidence: rows.length === 4 && rows.every((row) => row.okCount >= 1),
    citationsValid: rows.length === 4 && rows.every((row) => row.citationValid),
    fairnessDifference,
    fairnessPass: fairnessDifference !== null && fairnessDifference <= 0.5,
    p1HigherThanP2: p1?.weightedScore !== null && p1?.weightedScore !== undefined && p2?.weightedScore !== null && p2?.weightedScore !== undefined && p1.weightedScore > p2.weightedScore,
    schemaOnly: rows.length === 4 && rows.every((row) => row.schemaOnly),
  };
  const report = {
    generatedAt: new Date().toISOString(),
    synthetic: true,
    independentlyReviewed: false,
    scope: "actual Groq run_agent_role evaluation; document chunking, prompt building, citation verification, and weighted scoring; DB telemetry mocked",
    model: "openai/gpt-oss-120b",
    checks,
    calls: state.telemetry.length,
    inputTokens: rows.reduce((total, row) => total + row.inputTokens, 0),
    outputTokens: rows.reduce((total, row) => total + row.outputTokens, 0),
    rows,
  };
  mkdirSync("docs/verification/evaluation-results", { recursive: true });
  writeFileSync(`docs/verification/evaluation-results/agent-role-${report.generatedAt.replace(/[:.]/g, "-")}.json`, `${JSON.stringify(report, null, 2)}\n`);
  expect(checks.allHaveEvidence).toBe(true);
  expect(checks.citationsValid).toBe(true);
  expect(checks.fairnessPass).toBe(true);
  expect(checks.p1HigherThanP2).toBe(true);
  expect(checks.schemaOnly).toBe(true);
});
