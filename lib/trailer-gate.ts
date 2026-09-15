import { TrailerScenario } from "@/lib/contracts";
import { MASK_PATTERNS } from "@/lib/mask";
import { validateScenario } from "@/lib/trailer";
import { ZodError } from "zod";

export type GateRule = "overlap" | "proper_noun" | "mask" | "schema";
export type GateViolation = { path: string; rule: GateRule };
type TextField = { path: string; text: string };

export function trailerTextFields(scenarios: TrailerScenario[]): TextField[] {
  return scenarios.flatMap((scenario, index) => {
    const path = `scenarios[${index}]`;
    return [
      { path: `${path}.title`, text: scenario.title }, { path: `${path}.summary`, text: scenario.summary },
      ...scenario.facts.flatMap((fact, i) => [{ path: `${path}.facts[${i}].label`, text: fact.label }, { path: `${path}.facts[${i}].text`, text: fact.text }]),
      ...scenario.dialogues.flatMap((dialogue, i) => [{ path: `${path}.dialogues[${i}].question`, text: dialogue.question }, { path: `${path}.dialogues[${i}].quote`, text: dialogue.quote }]),
      ...scenario.choices.map((choice, i) => ({ path: `${path}.choices[${i}].label`, text: choice.label })),
      { path: `${path}.ending.quote`, text: scenario.ending.quote },
    ];
  });
}

const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();
export function runTrailerGate(input: unknown, sources: { sourceTexts: string[]; properNouns: string[] }): { passed: boolean; violations: GateViolation[] } {
  const violations: GateViolation[] = [];
  if (!Array.isArray(input) || input.length < 1 || input.length > 3) return { passed: false, violations: [{ path: "scenarios", rule: "schema" }] };
  const scenarios: TrailerScenario[] = [];
  input.forEach((scenario, index) => {
    try { scenarios.push(validateScenario(scenario)); }
    catch (error) {
      if (error instanceof ZodError) {
        for (const issue of error.issues) violations.push({ path: `scenarios[${index}]${issue.path.map((key) => typeof key === "number" ? `[${key}]` : `.${String(key)}`).join("")}`, rule: "schema" });
      } else violations.push({ path: `scenarios[${index}]`, rule: "schema" });
    }
  });
  if (new Set(scenarios.map((scenario) => scenario.id)).size !== scenarios.length) violations.push({ path: "scenarios", rule: "schema" });
  if (violations.length) return { passed: false, violations };
  const windows = new Set<string>();
  for (const source of sources.sourceTexts) {
    const normalized = normalize(source);
    for (let i = 0; i <= normalized.length - 20; i++) windows.add(normalized.slice(i, i + 20));
  }
  const nouns = sources.properNouns.map((noun) => noun.trim().toLowerCase()).filter((noun) => noun.length >= 2);
  for (const field of trailerTextFields(scenarios)) {
    const text = normalize(field.text);
    for (let i = 0; i <= text.length - 20; i++) if (windows.has(text.slice(i, i + 20))) { violations.push({ path: field.path, rule: "overlap" }); break; }
    if (nouns.some((noun) => text.toLowerCase().includes(noun))) violations.push({ path: field.path, rule: "proper_noun" });
    if (MASK_PATTERNS.some(({ re }) => new RegExp(re.source, re.flags.replace("g", "")).test(field.text))) violations.push({ path: field.path, rule: "mask" });
  }
  return { passed: violations.length === 0, violations };
}

export function trailerApprovalItems(scenarios: TrailerScenario[]): (TextField & { id: string })[] {
  return scenarios.flatMap((scenario, index) => {
    const path = `scenarios[${index}]`; const id = scenario.id;
    return [
      { id: `${id}:title`, path: `${path}.title`, text: scenario.title }, { id: `${id}:summary`, path: `${path}.summary`, text: scenario.summary },
      ...scenario.facts.map((fact, i) => ({ id: `${id}:fact:${fact.id}`, path: `${path}.facts[${i}]`, text: `${fact.label}\n${fact.text}` })),
      ...scenario.dialogues.map((dialogue, i) => ({ id: `${id}:dialogue:${dialogue.id}`, path: `${path}.dialogues[${i}]`, text: `${dialogue.question}\n${dialogue.quote}` })),
      ...scenario.choices.map((choice, i) => ({ id: `${id}:choice:${choice.id}`, path: `${path}.choices[${i}]`, text: choice.label })),
      { id: `${id}:ending`, path: `${path}.ending.quote`, text: scenario.ending.quote },
    ];
  });
}
