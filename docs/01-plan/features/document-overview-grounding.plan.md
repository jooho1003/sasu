# document-overview-grounding — Plan

2026-10-05 · bkit PDCA · phase 51 · 원천 PRD §8 "문서 요약 overview 근거 검증", ADR-090.

## Executive Summary

| 관점 | 내용 |
|---|---|
| Problem | 문서 요약 `overview`는 검증 없이 렌더돼, 지시문을 심은 문서에서 문서에 없는 문장·지시 문구가 화면에 나왔다(V16 1/1·2/5). |
| Solution | overview 문장을 원문 문자열로 검증하고, 실패하면 검증된 요약 항목 문장으로 대체한다. |
| Function/UX Effect | 정상 문서는 그대로, 검증 실패 시 요약 상단 문장이 원문에 있는 핵심 문장으로 바뀐다. |
| Core Value | 화면의 모든 요약 문장이 원문에서 확인된다. |

## Context Anchor

| Key | Value |
|---|---|
| WHY | V16 overview 미검증 |
| WHO | 자료 검토함 사용자(lead·구성원) |
| RISK | 정상 요약의 overview도 대체되어 읽기 품질 저하 |
| SUCCESS | SC1 단위 테스트(검증·대체·고정 문구), SC2 V16 재실측 overview 금지 문자열 0, SC3 lint·test·build |
| SCOPE | `lib/pipeline/document-summary.ts` 한 모듈 + 테스트 |

## 2. Scope

overview 검증·대체만. 스키마·DB·LLM 호출·항목 검증 변경 없음. 문서 내 지시문 문장의 항목 채택은 범위 밖(ADR-090 경계).

## 3. Requirements

| ID | 요구 | 우선 |
|---|---|---|
| FR1 | chunk 검증에서 overview 문장마다 원문 포함 검사, 하나라도 실패 시 검증된 항목(key_points→decisions→actions, 최대 2개)으로 대체, 없으면 "요약할 내용을 찾지 못했습니다." | 높음 |
| FR2 | 병합 결과(`mergeDocumentSummaries`)의 overview도 같은 규칙(이미 검증된 chunk overview만 사용) | 높음 |
| FR3 | 대체 시 `dropped` +1 | 중간 |

## 4. Success Criteria

SC1 단위 테스트 red→green. SC2 `scripts/verify-document-injection.ts` 재실행에서 overview의 CANARY·문서 밖 문장 0. SC3 lint·test·build.

## 5. Risks

| 위험 | 완화 |
|---|---|
| 정상 요약 overview 과다 대체 | 문장 분리 후 공백 정규화한 비교, 대체 문장도 원문 문장이라 의미 손실 제한 |
