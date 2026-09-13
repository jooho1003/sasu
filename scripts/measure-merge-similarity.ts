import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadEnvConfig } from "@next/env";

import {
  embedText,
  embeddingModel,
  embeddingProvider,
} from "../lib/embeddings";

type FixturePair = {
  id: string;
  expected: "same" | "hard-different" | "different";
  left: string;
  right: string;
};

type Fixture = { pairs: FixturePair[] };

const MERGE_SIMILARITY_THRESHOLD = 0.85;

loadEnvConfig(process.cwd());

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) {
    throw new Error("embedding dimensions do not match");
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) {
    throw new Error("embedding norm is zero");
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function loadFixture(fixturePath: string): Fixture {
  const path = resolve(fixturePath);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<Fixture>;
  if (!Array.isArray(parsed.pairs) || parsed.pairs.length === 0) {
    throw new Error("merge similarity fixture must contain at least one pair");
  }
  return { pairs: parsed.pairs } as Fixture;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

async function main(): Promise<void> {
  if (embeddingProvider() !== "voyage" || embeddingModel() !== "voyage-4-lite") {
    throw new Error(
      "EMBEDDING_PROVIDER=voyage and EMBEDDING_MODEL=voyage-4-lite are required",
    );
  }

  const fixturePath = process.argv[2] ?? "fixtures/evaluation/merge-similarity.json";
  const outputPath = process.argv[3] ?? "docs/verification/D6-merge-similarity.md";
  const fixture = loadFixture(fixturePath);
  const cache = new Map<string, number[]>();
  const vectorFor = async (text: string): Promise<number[]> => {
    const cached = cache.get(text);
    if (cached) return cached;
    const result = await embedText(text, { inputType: "document" });
    cache.set(text, result.vector);
    return result.vector;
  };

  const rows: Array<FixturePair & { similarity: number }> = [];
  for (const pair of fixture.pairs) {
    const left = await vectorFor(pair.left);
    const right = await vectorFor(pair.right);
    rows.push({ ...pair, similarity: cosineSimilarity(left, right) });
  }

  console.table(
    rows.map((row) => ({
      pair: row.id,
      expected: row.expected,
      similarity: row.similarity.toFixed(6),
      threshold: row.similarity >= MERGE_SIMILARITY_THRESHOLD ? "pass" : "below",
    })),
  );

  const relations: FixturePair["expected"][] = [
    "same",
    "hard-different",
    "different",
  ];
  const rowsByRelation = Object.fromEntries(
    relations.map((relation) => [
      relation,
      rows.filter((row) => row.expected === relation),
    ]),
  ) as Record<FixturePair["expected"], Array<FixturePair & { similarity: number }>>;
  const stats = Object.fromEntries(
    relations.map((relation) => {
      const similarities = rowsByRelation[relation].map((row) => row.similarity);
      return [
        relation,
        {
          min: Math.min(...similarities),
          median: median(similarities),
          max: Math.max(...similarities),
        },
      ];
    }),
  ) as Record<FixturePair["expected"], { min: number; median: number; max: number }>;
  const thresholds = [0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85];
  const measuredAt = new Date().toISOString();
  const resultRows = rows
    .map(
      (row) =>
        `| ${row.id} | ${row.expected} | ${row.similarity.toFixed(6)} | ${
          row.similarity >= MERGE_SIMILARITY_THRESHOLD ? "예" : "아니오"
        } |`,
    )
    .join("\n");
  const statsRows = relations
    .map(
      (relation) =>
        `| ${relation} | ${stats[relation].min.toFixed(6)} | ${stats[relation].median.toFixed(6)} | ${stats[relation].max.toFixed(6)} |`,
    )
    .join("\n");
  const thresholdRows = thresholds
    .map((threshold) => {
      const merged = (expected: FixturePair["expected"]) =>
        rowsByRelation[expected].filter((row) => row.similarity >= threshold).length;
      return `| ${threshold.toFixed(2)} | ${merged("same")} | ${merged("hard-different")} | ${merged("different")} | ${merged("hard-different") + merged("different")} |`;
    })
    .join("\n");
  const nonSameRows = [...rowsByRelation["hard-different"], ...rowsByRelation.different];
  const report = `# D6 카드 병합 유사도 실측

- 실행 시각: ${measuredAt}
- 공급자·모델: Voyage AI \`voyage-4-lite\` (1024차원, \`input_type=document\`)
- 고정 병합 임계값: ${MERGE_SIMILARITY_THRESHOLD} (PRD §6-3 ⑥, 이 측정으로 변경하지 않음)
- fixture: \`${fixturePath}\`

| fixture | 기대 관계 | 코사인 유사도 | 0.85 이상 |
|---|---|---:|---|
${resultRows}

## 요약

| 기대 관계 | 최소 | 중앙값 | 최대 |
|---|---:|---:|---:|
${statsRows}

### 임계값별 병합·오병합 수

| 임계값 | same 병합 | hard-different 오병합 | different 오병합 | 비-same 오병합 합계 |
|---:|---:|---:|---:|---:|
${thresholdRows}

이 문서는 합성 fixture의 1회 실측 기록이다. 임계값 판정과 변경은 사람의 후속 결정 및 ADR 대상으로 남긴다.
`;

  writeFileSync(resolve(outputPath), report, "utf8");
  console.log("\nsummary:");
  console.table(
    thresholds.map((threshold) => ({
      threshold: threshold.toFixed(2),
      sameMerged: rowsByRelation.same.filter((row) => row.similarity >= threshold).length,
      hardDifferentFalseMerged: rowsByRelation["hard-different"].filter(
        (row) => row.similarity >= threshold,
      ).length,
      differentFalseMerged: rowsByRelation.different.filter(
        (row) => row.similarity >= threshold,
      ).length,
      nonSameFalseMerged: nonSameRows.filter((row) => row.similarity >= threshold).length,
    })),
  );
  console.log(
    `same_min=${stats.same.min.toFixed(6)} different_max=${Math.max(
      stats["hard-different"].max,
      stats.different.max,
    ).toFixed(6)}`,
  );
  console.log(`report=${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(
    `merge similarity measurement failed: ${
      error instanceof Error ? error.message : "unknown error"
    }`,
  );
  process.exitCode = 1;
});
