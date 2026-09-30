import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { acceptanceForAccuracy, measureAccuracy, validateAccuracyEvidence } from "../lib/recording/accuracy";

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("사용법: npx tsx scripts/measure-recording-accuracy.ts <측정 입력.json>");
  const input = JSON.parse(await readFile(resolve(inputPath), "utf8")) as unknown;
  const checked = validateAccuracyEvidence(input);
  if (!checked.ok || !checked.evidence) throw new Error(`측정 입력 부족: ${checked.errors.join(", ")}`);
  const evidence = checked.evidence;
  for (const trial of evidence.trials) {
    const file = await readFile(resolve(trial.file_path));
    const actualHash = createHash("sha256").update(file).digest("hex");
    if (actualHash !== trial.file_sha256) throw new Error(`${trial.mode}/${trial.glossary}: 원본 해시가 일치하지 않습니다.`);
  }
  const result = measureAccuracy(evidence);
  const acceptance = acceptanceForAccuracy(result.trials);
  const lines = [
    "# 웹 회의 녹음 정확률 실측",
    "",
    "공백은 문자 오류율에서 제외하고 구두점은 포함합니다. 같은 모드의 전후 비교는 동일한 원본 파일 해시를 사용합니다.",
    "",
    "| 모드 | 용어집 | OS | 브라우저 | 원본 SHA-256 | CER | 용어 CER | 오류 구간 낮은 신뢰 표시율 |",
    "|---|---|---|---|---|---:|---:|---:|",
    ...result.trials.map((trial) => `| ${trial.mode} | ${trial.glossary} | ${trial.os} | ${trial.browser} | \`${trial.fileSha256}\` | ${trial.cer.toFixed(4)} | ${trial.termCer?.toFixed(4) ?? "측정 불가"} | ${trial.lowConfidenceRecall?.toFixed(4) ?? "측정 불가"} |`),
    "",
    "| 결정 후보 | Precision | Recall | 정답 수 |",
    "|---|---:|---:|---:|",
    `| 병합 전 | ${result.decisions.before.precision.toFixed(4)} | ${result.decisions.before.recall.toFixed(4)} | ${result.decisions.before.truePositives} |`,
    `| 병합 후 | ${result.decisions.after.precision.toFixed(4)} | ${result.decisions.after.recall.toFixed(4)} | ${result.decisions.after.truePositives} |`,
    "",
    `설계된 정확률 기준: **${acceptance.passed ? "충족" : "미충족"}**${acceptance.failures.length ? ` (${acceptance.failures.join(", ")})` : ""}. 결정 후보는 수치 기록 대상이며 개선 목표치를 별도로 단정하지 않습니다.`,
    "",
    "이 표는 입력으로 제공한 라벨과 원본 해시를 계산한 결과입니다. 녹음 모드와 라벨의 실제 적합성은 별도로 확인해야 합니다.",
    "",
  ];
  const output = resolve("docs/verification/browser-meeting-recording/accuracy.md");
  await writeFile(output, lines.join("\n"), "utf8");
  process.stdout.write(`${output}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "정확률 측정 실패"}\n`);
  process.exitCode = 1;
});
