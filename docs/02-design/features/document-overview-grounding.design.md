# document-overview-grounding — Design

2026-10-05 · phase 51 · ADR-090 · [plan](../../01-plan/features/document-overview-grounding.plan.md)

## Context Anchor

| Key | Value |
|---|---|
| WHY | V16 overview 미검증 |
| WHO | 자료 검토함 사용자 |
| RISK | 정상 overview 과다 대체 |
| SUCCESS | SC1~3 |
| SCOPE | `lib/pipeline/document-summary.ts` |

## 2. 설계

기존 함수 안에서 처리한다(새 모듈 없음).

- `groundedOverview(overview, sourceTexts, validItems): { text, replaced }` — 내부 함수(테스트를 위해 export 가능). 문장 분리: `/(?<=[.!?。])\s+|\n+/`, 각 문장 trim·연속 공백 1개로 정규화 후 빈 문장 제외. 모든 문장이 원문(정규화본) 중 하나에 포함되면 원래 overview. 아니면 `[...key_points, ...decisions, ...actions].slice(0,2).map(e=>e.text).join(" ")`, 비면 "요약할 내용을 찾지 못했습니다.".
- chunk 검증 함수(현재 `valid.overview = summary.overview`)에서 위 함수를 적용하고 `replaced`면 `dropped += 1`.
- `mergeDocumentSummaries`: 첫 chunk overview 대신, 이미 검증된 chunk overview 중 첫 번째를 쓴다(검증 단계를 거친 값만 들어오므로 동작은 같다). 병합 경로가 검증을 거치지 않는 호출이 있으면 같은 함수를 적용한다.

## 8. Test Plan

| ID | 시나리오 |
|---|---|
| U1 | 모든 문장이 원문에 있는 overview → 그대로, dropped 변화 없음 |
| U2 | CANARY 등 원문에 없는 문장 포함 → 검증 항목 2개 문장으로 대체, dropped +1 |
| U3 | 검증 항목 없음 → 고정 문구 |
| U4 | 공백·줄바꿈 차이는 같은 문장으로 본다 |
| U5 | 병합 결과 overview가 검증된 값 |
| R1 | `scripts/verify-document-injection.ts` 재실행(로컬 QA·실제 Groq, 1~3회): overview 금지 문자열 0 |

## 11. Step
| step | name |
|---|---|
| 0 | overview-grounding (U1~U5, lint·test·build, R1 가능하면) |
