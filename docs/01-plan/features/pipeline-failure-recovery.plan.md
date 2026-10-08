# pipeline-failure-recovery — Plan

2026-10-09 · bkit PDCA · phase 54 · 원천 PRD §8 "작업 실패 처리", ADR-093. 근거 실측: `docs/verification/browser-meeting-recording/real-device-2026-10-08/README.md` 결함 2·3.

## Executive Summary

| 관점 | 내용 |
|---|---|
| Problem | (결함 3) 여러 chunk 문서 요약의 LLM 병합 호출이 출력 한도에 걸리면 이미 검증된 chunk 결과까지 버리고 요약 전체가 실패한다. (결함 2) 녹음 구간 마무리 RPC가 예외를 내면 job 재시도가 구간을 다시 잡지 못해 `done`으로 끝나고, 2분 스윕이 `timeout`으로 덮어써 실제 원인이 사라진다. |
| Solution | 병합 실패 시 검증된 chunk의 코드 병합본을 저장한다. 마무리 RPC 오류 시 같은 lease로 원인 코드를 `p_error`로 다시 기록한다. |
| Function/UX Effect | 긴 문서·회의 요약이 병합 실패로 통째로 사라지지 않는다. 구간 실패가 "처리 시간 초과" 대신 실제 실패로 남아 다시 시도할 수 있다. |
| Core Value | 검증을 마친 결과를 버리지 않고, 실패 원인을 정확히 남긴다. |

## Context Anchor

| Key | Value |
|---|---|
| WHY | 실기기 실측 결함 2·3 (PR #48) |
| WHO | 자료 검토함·회의 녹음 사용자(lead·구성원) |
| RISK | 병합 대체본의 overview가 첫 chunk 기준이라 덜 종합적 · 두 번째 마무리 호출이 lease 만료로 거절되면 여전히 `timeout` |
| SUCCESS | SC1 단위 테스트 red→green(병합 실패 대체·마무리 오류 원인 기록), SC2 lint·test·build, SC3 기존 성공 경로 LLM·RPC 호출 수 불변 |
| SCOPE | `lib/pipeline/document-summary.ts`, `lib/pipeline/review-material.ts` + 각 테스트. DB·migration·화면 변경 없음 |

## 1. Overview

원천은 PRD §8 "작업 실패 처리"와 ADR-093이다. 이 문서는 절 매핑과 `/pdca analyze` 비교 목록만 둔다. 결정(사용자 2026-10-09): 결함 3은 "병합 유지 + 실패 시 대체", 결함 2는 "같은 lease로 원인 기록".

## 2. Scope

포함: 병합 호출 실패 시 대체 저장(결함 3), 마무리 RPC 오류 시 원인 기록(결함 2), 마무리 RPC `false`의 로그.
제외: 병합 호출 제거·출력 한도 조정(ADR-093 대안 A·B, 별도 판단), `claim_review_part` SQL 변경, 결함 5·6·7, 화면 문구.

## 3. Requirements

| ID | 요구 | 우선 |
|---|---|---|
| FR1 | `mergeVerifiedDocumentSummaries`에서 `merge()`가 throw하면 `extracted`(검증된 chunk 코드 병합본)를 결과로 쓴다. 대체본도 `verifyDocumentSummary`를 거친다 | 높음 |
| FR2 | 대체가 일어나면 `console.warn("document_summary_merge_fallback", { documentId, errorCode })`만 남긴다 — 문서 본문·모델 출력 금지 | 중간 |
| FR3 | chunk 추출 실패는 지금처럼 job 실패(`document_summary_chunk_failed:i`) | 높음 |
| FR4 | `processReviewPart`에서 마무리 RPC가 `error`를 돌려주면 같은 RPC를 같은 lease로 `p_sections: []`, `p_error: <code>`, (녹음이면) `p_last_word_end: null`로 한 번 더 부른다. `<code>`는 오류 메시지가 `transcription_boundary_invalid`·`transcription_sections_invalid`면 그 값, 아니면 `review_completion_failed` | 높음 |
| FR5 | 두 번째 호출이 오류 없이 끝나면 handler는 정상 종료한다. 두 번째 호출도 `error`면 지금처럼 `review_completion_failed` 예외 | 높음 |
| FR6 | 마무리 RPC가 `data === false`면 동작은 그대로 두고 `console.warn("review_part_finish_rejected", { partId })`만 남긴다 | 낮음 |

## 4. Success Criteria

SC1 단위 테스트 red→green(아래 design §8 U1~U8). SC2 `npm run lint && npm run test`, `npx next build --webpack`. SC3 기존 테스트 무변경 통과(성공 경로 호출 수 불변).

## 5. Risks

| 위험 | 완화 |
|---|---|
| 대체본 overview가 첫 chunk의 것 | overview는 ADR-090 문자열 검증을 그대로 거친다. 병합 호출 제거 여부는 별도 판단(ADR-093 대안 A) |
| 원인 기록 호출이 lease 만료로 `false` | 지금과 같은 `timeout`으로 남는다(악화 없음). lease 연장은 범위 밖 |
| 로그로 원문 유출 | 로그 필드를 ID·오류 코드로 고정하고 테스트로 확인 |

## 6. Impact Analysis

| 자원 | 변경 | 소비자 |
|---|---|---|
| `lib/pipeline/document-summary.ts` `mergeVerifiedDocumentSummaries` | 선택 인자 `onMergeFailure` 추가, 병합 실패 시 대체 | `summarizeDocument`, `tests/pipeline/document-summary.test.ts` |
| `lib/pipeline/review-material.ts` `processReviewPart` | 마무리 오류 시 원인 기록 재호출 | `process_review` job, `tests/pipeline/review-material.test.ts` |
| DB·RPC·화면 | 없음 | — |
