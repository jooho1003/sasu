import { z } from "zod";
import { TrailerGateReport, TrailerScenario, TrailerAttemptSubmission, TrailerAttemptResult, type AgentRoleCriterion } from "@/lib/contracts";
import { isDeepStrictEqual } from "node:util";
import { validateAttemptSubmissions, verifyTrailerScore } from "@/lib/trailer-assessment";
import { syntheticAttemptId } from "@/lib/trailer-synthetic";
import { weightedScore } from "@/lib/agent-role";
import { runTrailerGate, trailerTextFields } from "@/lib/trailer-gate";
const Snapshot = z.strictObject({ schema_version: z.literal(1), dept_id: z.uuid(), decision_ids: z.array(z.uuid()).min(1).max(3), scenarios: TrailerScenario.array().min(1).max(3), gate_report: TrailerGateReport, generated_at: z.iso.datetime({ offset: true }) });
export type DemoTrailerSnapshot = z.infer<typeof Snapshot>;
export function parseDemoTrailerSnapshot(data: unknown, context: { sourceTexts: string[]; properNouns: string[]; knownDecisionIds: string[] }): { status: "ok"; snapshot: DemoTrailerSnapshot } | { status: "invalid"; reason: string } {
  const parsed = Snapshot.safeParse(data); if (!parsed.success) return { status: "invalid", reason: "schema" };
  const snapshot = parsed.data;
  if (new Set(snapshot.decision_ids).size !== snapshot.decision_ids.length || snapshot.decision_ids.some((id) => !context.knownDecisionIds.includes(id)) || snapshot.scenarios.length !== snapshot.decision_ids.length) return { status: "invalid", reason: "decision_ids" };
  const gate = runTrailerGate(snapshot.scenarios, context); if (!gate.passed) return { status: "invalid", reason: gate.violations[0].rule };
  if (trailerTextFields(snapshot.scenarios).some((field) => /합격|불합격|탈락|추천|적합도/u.test(field.text))) return { status: "invalid", reason: "forbidden_word" };
  return { status: "ok", snapshot: { ...snapshot, gate_report: gate } };
}

const AttemptSnapshot = z.strictObject({ id: z.uuid(), kind: z.literal("synthetic"), label: z.enum(["합성 지원자 A", "합성 지원자 B", "합성 지원자 C"]), submissions: z.array(TrailerAttemptSubmission), status: z.literal("scored"), result: TrailerAttemptResult, weighted_score: z.number().min(0).max(5) });
export function parseDemoAttemptsSnapshot(data: unknown, context: { trailerId: string; scenarios: TrailerScenario[]; rubric: AgentRoleCriterion[] }): { status: "ok"; attempts: z.infer<typeof AttemptSnapshot>[] } | { status: "invalid"; reason: string } {
  const parsed = z.strictObject({ schema_version: z.literal(1), trailer_id: z.uuid(), attempts: z.array(AttemptSnapshot).length(3) }).safeParse(data);
  if (!parsed.success) return { status: "invalid", reason: "schema" };
  if (parsed.data.trailer_id !== context.trailerId || new Set(parsed.data.attempts.map((a) => a.label)).size !== 3) return { status: "invalid", reason: "identity" };
  for (const attempt of parsed.data.attempts) {
    if (attempt.id !== syntheticAttemptId(context.trailerId, attempt.label)) return { status: "invalid", reason: "identity" };
    try { validateAttemptSubmissions(context.scenarios, attempt.submissions); } catch { return { status: "invalid", reason: "attempt_invalid" }; }
    const verified = verifyTrailerScore({ criteria: attempt.result.criteria.map((c) => ({ key: c.key, score: c.score, rationale: c.rationale, evidence: c.evidence })), interview_questions: attempt.result.interview_questions }, { ...context, submissions: attempt.submissions });
    if (!isDeepStrictEqual(verified, attempt.result)) return { status: "invalid", reason: "result_invalid" };
    const total = weightedScore(verified.criteria.map((c) => ({ ...c, evidence: c.evidence_status })));
    if (total === null || total !== attempt.weighted_score) return { status: "invalid", reason: "weighted_score" };
  }
  return { status: "ok", attempts: parsed.data.attempts };
}
