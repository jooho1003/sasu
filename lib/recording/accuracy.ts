import { RecordingAccuracyEvidence, type RecordingAccuracyEvidence as Evidence } from "@/lib/contracts";

function chars(text: string): string[] {
  return Array.from(text.normalize("NFC").replace(/\s+/g, ""));
}

function characterDistance(reference: string, hypothesis: string): { edits: number; total: number } {
  const expected = chars(reference);
  const actual = chars(hypothesis);
  let previous = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let i = 1; i <= expected.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= actual.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (expected[i - 1] === actual[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return { edits: previous[actual.length], total: expected.length };
}

export function characterErrorRate(reference: string, hypothesis: string): number {
  const { edits, total } = characterDistance(reference, hypothesis);
  return total === 0 ? (edits === 0 ? 0 : 1) : edits / total;
}

export function classificationScores(reference: string[], predicted: string[]) {
  const truth = new Set(reference);
  const guesses = new Set(predicted);
  const truePositives = [...guesses].filter((id) => truth.has(id)).length;
  return {
    precision: guesses.size ? truePositives / guesses.size : truth.size ? 0 : 1,
    recall: truth.size ? truePositives / truth.size : 1,
    truePositives,
  };
}

export function lowConfidenceRecall(sections: Array<{ error: boolean; flagged: boolean }>): number | null {
  const errors = sections.filter((section) => section.error);
  return errors.length ? errors.filter((section) => section.flagged).length / errors.length : null;
}

export function validateAccuracyEvidence(input: unknown): { ok: boolean; errors: string[]; evidence: Evidence | null } {
  const parsed = RecordingAccuracyEvidence.safeParse(input);
  if (!parsed.success) return { ok: false, errors: ["invalid_shape"], evidence: null };
  const { trials, meetings } = parsed.data;
  const errors: string[] = [];
  if (trials.length !== 6) errors.push("six_mode_comparisons_required");
  const modes = ["microphone", "tab", "system"] as const;
  for (const mode of modes) {
    const before = trials.filter((trial) => trial.mode === mode && trial.glossary === "before");
    const after = trials.filter((trial) => trial.mode === mode && trial.glossary === "after");
    if (before.length !== 1 || after.length !== 1) { errors.push(`${mode}_pair_required`); continue; }
    if (before[0].file_sha256 !== after[0].file_sha256 || before[0].reference !== after[0].reference)
      errors.push(`${mode}_same_audio_required`);
  }
  if (trials.some((trial) => trial.duration_seconds < 1200)) errors.push("twenty_minutes_required");
  if (trials.some((trial) => new Set(trial.terms.map((term) => term.reference)).size < 30)) errors.push("thirty_terms_required");
  if (meetings.length !== 5 || new Set(meetings.map((meeting) => meeting.id)).size !== 5) errors.push("five_labeled_meetings_required");
  if (trials.every((trial) => !trial.sections.some((section) => section.error))) errors.push("error_section_labels_required");
  return { ok: errors.length === 0, errors, evidence: errors.length ? null : parsed.data };
}

export function measureAccuracy(evidence: Evidence) {
  const trials = evidence.trials.map((trial) => {
    const terms = trial.terms.map((term) => characterDistance(term.reference, term.recognized));
    const termEdits = terms.reduce((sum, term) => sum + term.edits, 0);
    const termCharacters = terms.reduce((sum, term) => sum + term.total, 0);
    return {
      mode: trial.mode,
      glossary: trial.glossary,
      cer: characterErrorRate(trial.reference, trial.hypothesis),
      termCer: termCharacters ? termEdits / termCharacters : null,
      lowConfidenceRecall: lowConfidenceRecall(trial.sections),
      fileSha256: trial.file_sha256,
      os: trial.os,
      browser: trial.browser,
    };
  });
  const labels = evidence.meetings.flatMap((meeting) => meeting.labels.map((id) => `${meeting.id}:${id}`));
  const before = evidence.meetings.flatMap((meeting) => meeting.before.map((id) => `${meeting.id}:${id}`));
  const after = evidence.meetings.flatMap((meeting) => meeting.after.map((id) => `${meeting.id}:${id}`));
  return { trials, decisions: { before: classificationScores(labels, before), after: classificationScores(labels, after) } };
}

export function acceptanceForAccuracy(trials: Array<{
  mode: string; glossary: string; cer: number; termCer: number | null; lowConfidenceRecall: number | null;
}>): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  for (const mode of ["microphone", "tab", "system"]) {
    const before = trials.find((trial) => trial.mode === mode && trial.glossary === "before");
    const after = trials.find((trial) => trial.mode === mode && trial.glossary === "after");
    if (!before || !after) { failures.push(`${mode}_pair_missing`); continue; }
    if (before.termCer === null || after.termCer === null || after.termCer >= before.termCer)
      failures.push(`${mode}_term_cer_not_improved`);
    if (after.cer > before.cer) failures.push(`${mode}_overall_cer_regressed`);
    if (after.lowConfidenceRecall === null || after.lowConfidenceRecall < 0.5)
      failures.push(`${mode}_low_confidence_below_half`);
  }
  return { passed: failures.length === 0, failures };
}
