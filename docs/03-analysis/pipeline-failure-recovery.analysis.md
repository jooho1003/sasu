# pipeline-failure-recovery — Analysis (PDCA Check)

2026-10-09 · phase 54 · root 최종 리뷰(정적 대조 + 단위 실행). 설계: [design](../02-design/features/pipeline-failure-recovery.design.md) §2·§8. 실행 기록: [verification](../verification/54-pipeline-failure-recovery/verification.md).

## Context Anchor

| Key | Value |
|---|---|
| WHY | 실기기 실측 결함 2·3 (PR #48) |
| WHO | 자료 검토함·회의 녹음 사용자(lead·구성원) |
| RISK | 대체본 overview가 첫 chunk 기준 · 원인 기록 재호출이 lease 만료로 거절되면 기존 `timeout` 유지 |
| SUCCESS | SC1 U1~U8 red→green · SC2 lint·test·build · SC3 성공 경로 호출 수 불변 |
| SCOPE | `lib/pipeline/document-summary.ts`, `lib/pipeline/review-material.ts` |

## 1. 일치율

| 축 | 비율 | 근거 |
|---|---|---|
| Structural | 100% | `mergeVerifiedDocumentSummaries(chunks, merge, onMergeFailure?)`(`document-summary.ts:58-81`), `finishErrorCode`(`review-material.ts:16-25`), 테스트 2파일 |
| Functional | 100% | FR1~FR6: 병합 throw → `extracted`·검증 재적용(76-80), 대체 로그 ID·코드만(180-183), chunk 실패는 기존 throw(147-151), 마무리 오류 → 같은 lease·`p_sections: []`·원인 코드·녹음이면 `p_last_word_end: null`(186-192), 2차 오류 throw(193), `false` 로그 후 return(179-183) |
| Contract | 100% | DB·migration·RPC 시그니처·저장 형식·`status_reason` 값 변경 없음. 성공 경로 LLM·RPC 호출 수 그대로(기존 테스트 무변경 통과) |
| Runtime | 100% | 단위 1,935 passed(U1~U4 `tests/pipeline/document-summary.test.ts:138-230`, U5~U8 `tests/pipeline/review-material.test.ts:122-245`), lint 0, webpack build 0 |
| **Overall** | **100%** | 15 + 25 + 25 + 35 |

## 2. 전략 정합

- WHY 충족: 병합 호출이 실패해도 검증된 요약이 저장된다. 구간 마무리 오류는 `failed(transcription_boundary_invalid | transcription_sections_invalid | review_completion_failed)`로 남아 스윕의 `timeout`이 덮지 않는다(구간이 `failed`가 되어 스윕 대상 `processing`에서 빠진다).
- 결정 준수: 사용자 선택(결함 3 "병합 유지 + 실패 시 대체", 결함 2 "같은 lease로 원인 기록")과 ADR-093 경계 그대로.

## 3. Gap 목록과 처리

| # | 심각도 | 내용 | 처리 |
|---|---|---|---|
| — | Critical/Important | 없음 | — |
| M1 | Minor | 새 테스트 이름 U1~U4가 같은 파일의 overview 테스트(U1~U4, 다른 describe)와 겹친다 | 동작 영향 없음. 유지 |
| M2 | Minor | 실제 Groq·실제 녹음으로 실패 경로를 재현하지 않았다 | verification "하지 않은 것"에 기록 |
| M3 | 참고 | 로컬 build가 PR #48의 docs 스크립트로 깨져 있었다 | `tsconfig.json` exclude `docs`(`bc6858c`)로 같은 PR에서 수정 |
