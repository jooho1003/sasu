import { TrailerScenario, TrailerSubmission } from "@/lib/contracts";

/** Public content only. This checks evidence integrity, not confidentiality or publication approval. */
export function validateScenario(input: unknown): TrailerScenario {
  const scenario = TrailerScenario.parse(input);
  for (const entries of [scenario.facts, scenario.dialogues, scenario.choices]) {
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
      throw new Error("trailer_duplicate_id");
    }
  }
  for (const citation of [...scenario.dialogues, scenario.ending]) {
    const fact = scenario.facts.find((entry) => entry.id === citation.fact_id);
    if (!fact || !fact.text.includes(citation.quote)) {
      throw new Error("trailer_citation_invalid");
    }
  }
  if (!scenario.choices.some((choice) => choice.id === scenario.ending.choice_id)) {
    throw new Error("trailer_choice_invalid");
  }
  return scenario;
}

/** No score: every offered choice is valid when the participant supplies their own reason and evidence. */
export function validateSubmission(
  scenario: TrailerScenario,
  discoveredFactIds: readonly string[],
  input: unknown,
): TrailerSubmission | null {
  const parsed = TrailerSubmission.safeParse(input);
  if (!parsed.success) return null;
  const submission = parsed.data;
  if (!scenario.choices.some((choice) => choice.id === submission.choice_id)) return null;
  if (new Set(submission.fact_ids).size !== submission.fact_ids.length) return null;
  if (!submission.fact_ids.every((id) =>
    discoveredFactIds.includes(id) && scenario.facts.some((fact) => fact.id === id),
  )) return null;
  return submission;
}
