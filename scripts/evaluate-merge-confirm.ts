import { once } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { resolve } from "node:path";

import { loadEnvConfig } from "@next/env";

import { MergeConfirmation } from "../lib/contracts";
import {
  embedText,
  embeddingModel,
  embeddingProvider,
} from "../lib/embeddings";
import { llm } from "../lib/llm";
import {
  createMergeConfirmationPrompt,
  MERGE_CANDIDATE_MIN_SIMILARITY,
} from "../lib/pipeline/card";

type FixturePair = {
  id: string;
  expected: "same" | "hard-different" | "different";
  left: string;
  right: string;
};

type Fixture = { pairs: FixturePair[] };

type EvaluationRow = FixturePair & {
  similarity: number;
  llmVerdict: boolean | null;
  finalMerge: boolean;
  errorCode: string | null;
};

type CapturedLlmCall = {
  purpose?: unknown;
  model?: unknown;
};

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

function loadFixture(path: string): Fixture {
  const parsed = JSON.parse(readFileSync(resolve(path), "utf8")) as Partial<Fixture>;
  if (!Array.isArray(parsed.pairs) || parsed.pairs.length !== 24) {
    throw new Error("extended merge fixture must contain exactly 24 pairs");
  }
  return { pairs: parsed.pairs } as Fixture;
}

async function bodyOf(request: IncomingMessage): Promise<string> {
  request.setEncoding("utf8");
  let body = "";
  for await (const chunk of request) {
    body += chunk;
  }
  return body;
}

async function startLlmCallCapture(): Promise<{
  calls: CapturedLlmCall[];
  close: () => Promise<void>;
}> {
  const calls: CapturedLlmCall[] = [];
  const server = createServer(async (request, response) => {
    if (request.method === "POST" && request.url?.startsWith("/rest/v1/llm_calls")) {
      try {
        calls.push(JSON.parse(await bodyOf(request)) as CapturedLlmCall);
        response.writeHead(201, { "content-type": "application/json" });
        response.end("[]");
      } catch {
        response.writeHead(400, { "content-type": "application/json" });
        response.end('{"message":"invalid evaluation payload"}');
      }
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end('{"message":"not found"}');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("failed to start local llm_calls capture");
  }

  // 평가 호출 기록은 로컬 캡처로만 보낸다. 운영 Supabase에는 쓰지 않는다.
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "evaluation-only-service-role-key";

  return {
    calls,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

function safeErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = Reflect.get(error, "code");
    if (typeof code === "string") return code;
    const name = Reflect.get(error, "name");
    if (typeof name === "string") return name;
  }
  return "unknown";
}

async function main(): Promise<void> {
  if (embeddingProvider() !== "voyage" || embeddingModel() !== "voyage-4-lite") {
    throw new Error(
      "EMBEDDING_PROVIDER=voyage and EMBEDDING_MODEL=voyage-4-lite are required",
    );
  }
  if (!process.env.GROQ_API_KEY || !process.env.VOYAGE_API_KEY) {
    throw new Error("GROQ_API_KEY and VOYAGE_API_KEY are required");
  }

  const fixturePath = "fixtures/evaluation/merge-similarity-extended.json";
  const outputPath = "docs/verification/D7-merge-confirm-eval.md";
  const fixture = loadFixture(fixturePath);
  const capture = await startLlmCallCapture();
  const vectorCache = new Map<string, number[]>();
  const vectorFor = async (text: string): Promise<number[]> => {
    const cached = vectorCache.get(text);
    if (cached) return cached;
    const result = await embedText(text, { inputType: "document" });
    vectorCache.set(text, result.vector);
    return result.vector;
  };

  const rows: EvaluationRow[] = [];
  let structuredInvocations = 0;
  try {
    for (const pair of fixture.pairs) {
      const left = await vectorFor(pair.left);
      const right = await vectorFor(pair.right);
      const similarity = cosineSimilarity(left, right);
      let llmVerdict: boolean | null = null;
      let errorCode: string | null = null;

      if (similarity >= MERGE_CANDIDATE_MIN_SIMILARITY) {
        structuredInvocations += 1;
        try {
          const result = await llm.structured(
            "merge_confirm",
            MergeConfirmation,
            createMergeConfirmationPrompt({
              candidateCard: {
                request_id: `evaluation-${pair.id}`,
                title: pair.left,
                background: pair.left,
                cited_items: [
                  { item_id: `left-${pair.id}`, content: pair.left },
                ],
              },
              newItem: { item_id: `right-${pair.id}`, content: pair.right },
            }),
          );
          if (result.meta.model !== "openai/gpt-oss-20b") {
            throw new Error("merge_confirm used an unexpected model");
          }
          llmVerdict = result.data.same_decision;
        } catch (error) {
          errorCode = safeErrorCode(error);
        }
      }

      rows.push({
        ...pair,
        similarity,
        llmVerdict,
        finalMerge:
          similarity >= MERGE_CANDIDATE_MIN_SIMILARITY && llmVerdict === true,
        errorCode,
      });
    }
  } finally {
    await capture.close();
  }

  if (
    capture.calls.length === 0 ||
    capture.calls.some(
      (call) =>
        call.purpose !== "merge_confirm" ||
        call.model !== "openai/gpt-oss-20b",
    )
  ) {
    throw new Error("merge_confirm llm_calls capture validation failed");
  }

  const sameRows = rows.filter((row) => row.expected === "same");
  const hardDifferentRows = rows.filter(
    (row) => row.expected === "hard-different",
  );
  const differentRows = rows.filter((row) => row.expected === "different");
  const sameMerged = sameRows.filter((row) => row.finalMerge).length;
  const hardDifferentFalseMerged = hardDifferentRows.filter(
    (row) => row.finalMerge,
  ).length;
  const differentFalseMerged = differentRows.filter(
    (row) => row.finalMerge,
  ).length;
  const falseMerged = hardDifferentFalseMerged + differentFalseMerged;
  const passed = sameMerged >= 7 && falseMerged === 0;
  const measuredAt = new Date().toISOString();
  const resultRows = rows
    .map((row) => {
      const verdict = row.errorCode
        ? `오류(${row.errorCode})`
        : row.llmVerdict === null
          ? "미호출"
          : row.llmVerdict
            ? "true"
            : "false";
      return `| ${row.id} | ${row.expected} | ${row.similarity.toFixed(6)} | ${verdict} | ${row.finalMerge ? "예" : "아니오"} |`;
    })
    .join("\n");
  const report = `# D7 카드 병합 LLM 확인 평가

- 실행 시각: ${measuredAt}
- fixture: \`${fixturePath}\` (문장·라벨 변경 없음)
- 임베딩: Voyage AI \`voyage-4-lite\` (\`input_type=document\`)
- 후보 임계값: ${MERGE_CANDIDATE_MIN_SIMILARITY}
- 확인 모델: Groq \`openai/gpt-oss-20b\`, \`llm.structured("merge_confirm")\`, strict json_schema
- 카드 구성: 왼쪽 원문을 제목·배경에 그대로 사용하고 같은 원문 인용 1건을 첨부, 오른쪽 원문을 새 item으로 사용
- 운영 DB 쓰기: 0건. \`llm_calls\` POST는 로컬 HTTP 캡처로 검증

| fixture | 기대 관계 | 유사도 | LLM 판정 | 최종 병합 |
|---|---|---:|---|---|
${resultRows}

## 요약

| 지표 | 결과 |
|---|---:|
| same 병합 | ${sameMerged}/10 |
| hard-different 오병합 | ${hardDifferentFalseMerged}/10 |
| different 오병합 | ${differentFalseMerged}/4 |
| 전체 오병합 | ${falseMerged} |
| \`llm.structured\` 호출 수 | ${structuredInvocations} |
| 로컬 캡처 \`llm_calls\` 행 수 | ${capture.calls.length} |

**ADR-037 게이트: ${passed ? "통과" : "미달"}** — 기준은 오병합 0건 및 same 병합 7/10 이상이다.

이 결과는 고정 합성 fixture의 1회 실측이며 문자열 인용 검증이나 실제 파일럿 데이터 정확도를 대신하지 않는다.
`;

  writeFileSync(resolve(outputPath), report, "utf8");
  console.table(
    rows.map((row) => ({
      pair: row.id,
      expected: row.expected,
      similarity: row.similarity.toFixed(6),
      llm: row.errorCode ?? String(row.llmVerdict),
      merged: row.finalMerge,
    })),
  );
  console.log(
    `same=${sameMerged}/10 hard-different_false=${hardDifferentFalseMerged}/10 different_false=${differentFalseMerged}/4 llm_calls=${structuredInvocations} gate=${passed ? "passed" : "failed"}`,
  );
  console.log(`report=${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(
    `merge confirmation evaluation failed: ${safeErrorCode(error)}`,
  );
  process.exitCode = 1;
});
