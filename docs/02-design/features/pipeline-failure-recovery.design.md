# pipeline-failure-recovery — Design

2026-10-09 · phase 54 · ADR-093 · [plan](../../01-plan/features/pipeline-failure-recovery.plan.md)

## Context Anchor

| Key | Value |
|---|---|
| WHY | 실기기 실측 결함 2·3 |
| WHO | 자료 검토함·회의 녹음 사용자 |
| RISK | 대체본 overview 품질 · lease 만료 시 기존 `timeout` 유지 |
| SUCCESS | SC1~3 |
| SCOPE | `lib/pipeline/document-summary.ts`, `lib/pipeline/review-material.ts` |

## 1. 설계안 비교

| 안 | 결함 3 | 결함 2 | 변경 범위 | 선택 |
|---|---|---|---|---|
| A 최소 변경 | 병합 실패 시 검증된 코드 병합본 저장 | 같은 lease로 마무리 RPC를 `p_error`로 재호출 | 2 모듈, DB 없음 | **선택**(사용자 2026-10-09) |
| B 구조 정리 | 병합 LLM 호출 제거 | 새 `fail_review_part` RPC + claim이 lease 만료 구간 재획득 | migration·SQL 하니스·동시성 경계 | — |
| C 절충 | A + 병합 호출 출력 한도·추론 강도 지정 | A + 마무리 거절 원인 세분화 | `lib/llm.ts` 옵션 추가 | — (한도 숫자 근거 없음) |

## 2. 설계

새 모듈·DB·migration·RPC 없음. 두 기존 함수 안에서만 바꾼다.

### 2-1. 문서 요약 병합 대체 (`lib/pipeline/document-summary.ts`)

- `mergeVerifiedDocumentSummaries(chunks, merge, onMergeFailure?)` — 세 번째 인자 `onMergeFailure?: (error: unknown) => void`를 더한다(기존 호출·테스트 호환).
- `verifiedChunks.length > 1`일 때 `merge(extracted)`를 try/catch로 감싼다. throw하면 `onMergeFailure?.(error)` 후 `output = extracted`. 그 뒤 `verifyDocumentSummary(output, items)`는 그대로.
- `summarizeDocument`는 `onMergeFailure`로 `console.warn("document_summary_merge_fallback", { documentId: document.source_id, errorCode })`를 넘긴다. `errorCode`는 error 객체의 `error_code` 문자열, 없으면 `"unknown"`. 메시지·cause·모델 출력은 로그에 넣지 않는다.
- chunk 추출 루프·저장 형식·`status_reason` 값은 바꾸지 않는다.

### 2-2. 구간 마무리 오류 원인 기록 (`lib/pipeline/review-material.ts`)

- `finishErrorCode(error: { message?: string } | null): "transcription_boundary_invalid" | "transcription_sections_invalid" | "review_completion_failed"` — 모듈 내부 함수(테스트용 export 가능).
- 마무리 RPC 호출을 RPC 이름·인자 생성으로 묶어 두 번 부를 수 있게 한다:
  1. 1차: 지금과 같은 인자.
  2. `finish.error`가 있으면 2차: 같은 RPC, `p_part`·`p_lease` 같음, `p_sections: []`, `p_error: finishErrorCode(finish.error)`, 녹음이면 `p_last_word_end: null`.
  3. 2차 `error` 없음 → return. 2차 `error` → `throw new Error("review_completion_failed")`(현재와 같음).
- 1차가 `data === false`면 `console.warn("review_part_finish_rejected", { partId: payload.partId })` 후 return.
- 2차가 `data === false`여도 return(lease 만료 등 — 스윕이 기존처럼 처리).

## 8. Test Plan

| ID | 시나리오 | 파일 |
|---|---|---|
| U1 | chunk 2개, `merge`가 throw → 결과가 검증된 코드 병합본, `onMergeFailure` 1회 | `tests/pipeline/document-summary.test.ts` |
| U2 | chunk 2개, `merge` 성공 → 지금과 같은 결과(대체 안 함, 콜백 0회) | 같음 |
| U3 | chunk 1개 → `merge` 호출 0회(기존 테스트 유지) | 같음 |
| U4 | 대체본에도 overview 검증(ADR-090)이 적용된다 | 같음 |
| U5 | 마무리 RPC가 `{ message: "transcription_sections_invalid" }` 오류 → 2차 호출 인자 `p_sections: []`·`p_error: "transcription_sections_invalid"`·`p_last_word_end: null`·같은 lease, handler 정상 종료 | `tests/pipeline/review-material.test.ts` |
| U6 | 알 수 없는 오류 메시지(원문 포함) → 2차 `p_error: "review_completion_failed"`, 오류 본문이 인자·로그에 없음 | 같음 |
| U7 | 1차·2차 모두 오류 → `review_completion_failed` throw | 같음 |
| U8 | 1차 `data: false` → 2차 호출 없음, throw 없음 | 같음 |

## 11. Step

| step | name | 모듈 |
|---|---|---|
| 0 | document-summary-merge-fallback | `lib/pipeline/document-summary.ts` (U1~U4) |
| 1 | review-part-failure-reason | `lib/pipeline/review-material.ts` (U5~U8) |
