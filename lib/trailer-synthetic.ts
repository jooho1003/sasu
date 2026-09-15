import { createHash } from "node:crypto";
import type { TrailerScenario, TrailerAttemptSubmission } from "@/lib/contracts";
import { validateAttemptSubmissions } from "@/lib/trailer-assessment";
export type SyntheticAttempt = { id: string; label: string; submissions: TrailerAttemptSubmission[] };
export function syntheticAttemptId(trailerId: string, label: string): string {
  const hash = createHash("sha1").update(`sasu:trailer-attempt:${trailerId}:${label}`).digest().subarray(0,16);
  hash[6] = (hash[6] & 0x0f) | 0x50; hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString("hex"); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function buildSyntheticAttempts(trailerId: string, scenarios: TrailerScenario[]): SyntheticAttempt[] {
  return ["A", "B", "C"].map((kind) => {
    const label = `합성 지원자 ${kind}`;
    const submissions = scenarios.map((scenario): TrailerAttemptSubmission => {
      const facts = kind === "A" ? scenario.facts : scenario.facts.slice(0, kind === "B" ? 1 : 2);
      const dialogues = kind === "B" ? [] : scenario.dialogues;
      const choice = kind === "B" ? scenario.choices.find((c) => c.id !== scenario.ending.choice_id)! : scenario.choices.find((c) => c.id === scenario.ending.choice_id)!;
      const events: TrailerAttemptSubmission["events"] = [...facts.map((f) => ({ kind: "open_fact" as const, ref: f.id })), ...dialogues.map((d) => ({ kind: "ask_dialogue" as const, ref: d.id })), { kind: "choose" as const, ref: choice.id }, { kind: "submit" as const, ref: scenario.id }].map((event, i) => ({ ...event, seq: i + 1 }));
      const principle = scenario.facts.find((f) => f.place === "library") ?? facts[0];
      const reason = kind === "A" ? `원칙에서 확인한 「${principle.text.slice(0,380)}」와 대화에서 확인한 「${dialogues[0].quote.slice(0,380)}」를 함께 보고 선택했습니다.` : kind === "B" ? "먼저 실행하고 다음 단계에서 조정하겠습니다." : `대화에서 확인한 「${dialogues[0].quote.slice(0,760)}」를 중심으로 관계자의 조건을 고려했습니다.`;
      return { scenario_id: scenario.id, choice_id: choice.id, reason, fact_ids: facts.map((f) => f.id), events };
    });
    return { id: syntheticAttemptId(trailerId,label), label, submissions: validateAttemptSubmissions(scenarios,submissions) };
  });
}
export function buildTraitVariantPair(trailerId: string, scenarios: TrailerScenario[]): [SyntheticAttempt, SyntheticAttempt] {
  const base = buildSyntheticAttempts(trailerId,scenarios)[0];
  const variant = (label: string, prefix: string) => ({ id: syntheticAttemptId(trailerId,label), label, submissions: base.submissions.map((s) => ({ ...s, reason: `${prefix}\n${s.reason}` })) });
  return [variant("특성 변형 A","저는 30대 여성입니다."), variant("특성 변형 B","저는 50대 남성입니다.")];
}
