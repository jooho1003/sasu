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
  expected: "same" | "different";
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

function loadFixture(): Fixture {
  const path = resolve("fixtures/evaluation/merge-similarity.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<Fixture>;
  if (!Array.isArray(parsed.pairs) || parsed.pairs.length !== 6) {
    throw new Error("merge similarity fixture must contain six pairs");
  }
  return { pairs: parsed.pairs } as Fixture;
}

async function main(): Promise<void> {
  if (embeddingProvider() !== "voyage" || embeddingModel() !== "voyage-4-lite") {
    throw new Error(
      "EMBEDDING_PROVIDER=voyage and EMBEDDING_MODEL=voyage-4-lite are required",
    );
  }

  const fixture = loadFixture();
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

  const sameRows = rows.filter((row) => row.expected === "same");
  const differentRows = rows.filter((row) => row.expected === "different");
  const sameMinimum = Math.min(...sameRows.map((row) => row.similarity));
  const differentMaximum = Math.max(
    ...differentRows.map((row) => row.similarity),
  );
  const measuredAt = new Date().toISOString();
  const resultRows = rows
    .map(
      (row) =>
        `| ${row.id} | ${row.expected} | ${row.similarity.toFixed(6)} | ${
          row.similarity >= MERGE_SIMILARITY_THRESHOLD ? "예" : "아니오"
        } |`,
    )
    .join("\n");
  const report = `# D6 카드 병합 유사도 실측

- 실행 시각: ${measuredAt}
- 공급자·모델: Voyage AI \`voyage-4-lite\` (1024차원, \`input_type=document\`)
- 고정 병합 임계값: ${MERGE_SIMILARITY_THRESHOLD} (PRD §6-3 ⑥, 이 측정으로 변경하지 않음)

| fixture | 기대 관계 | 코사인 유사도 | 0.85 이상 |
|---|---|---:|---|
${resultRows}

## 요약

- 같은 안건 3쌍 최소값: **${sameMinimum.toFixed(6)}**
- 다른 안건 3쌍 최대값: **${differentMaximum.toFixed(6)}**
- 같은 안건 중 임계값 미만: **${sameRows.filter((row) => row.similarity < MERGE_SIMILARITY_THRESHOLD).length}쌍**
- 다른 안건 중 임계값 이상: **${differentRows.filter((row) => row.similarity >= MERGE_SIMILARITY_THRESHOLD).length}쌍**

이 문서는 합성 fixture의 1회 실측 기록이다. 임계값 판정과 변경은 사람의 후속 결정 및 ADR 대상으로 남긴다.
`;

  writeFileSync(
    resolve("docs/verification/D6-merge-similarity.md"),
    report,
    "utf8",
  );
  console.log(
    `same_min=${sameMinimum.toFixed(6)} different_max=${differentMaximum.toFixed(6)}`,
  );
  console.log("report=docs/verification/D6-merge-similarity.md");
}

main().catch((error: unknown) => {
  console.error(
    `merge similarity measurement failed: ${
      error instanceof Error ? error.message : "unknown error"
    }`,
  );
  process.exitCode = 1;
});
