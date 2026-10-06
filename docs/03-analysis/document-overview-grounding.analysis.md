# document-overview-grounding — Analysis (PDCA Check)

2026-10-06 · phase 51 · gap-detector 독립 분석 + root 최종 리뷰. 설계: [design](../02-design/features/document-overview-grounding.design.md) §2·§8. 실행 기록: [verification](../verification/51-document-overview-grounding/step0.md).

## Context Anchor

| Key | Value |
|---|---|
| WHY | V16 실측에서 문서 요약 `overview`가 검증 없이 렌더돼 문서에 없는 문장·지시 문구(CANARY)가 화면에 나옴 |
| WHO | 자료 검토함 사용자(lead·구성원) |
| RISK | 정상 요약의 overview도 대체되어 읽기 품질 저하 |
| SUCCESS | SC1 단위 테스트 · SC2 V16 재실측 overview 금지 문자열·문서 밖 문장 0 · SC3 lint·test·build |
| SCOPE | PRD §8 "문서 요약 overview 근거 검증" / ADR-090 / `lib/pipeline/document-summary.ts` |

## 1. 일치율

| 축 | 비율 | 근거 |
|---|---|---|
| Structural | 100% | `groundedOverview` export, `verifyDocumentSummary`·`mergeVerifiedDocumentSummaries` 경로 적용, 테스트 2파일 |
| Functional | 100% | FR1~FR3, 설계 §2 세 항목 모두 집행(`document-summary.ts:25-46, 89-95, 141-148`) |
| Contract | 100% | 저장 형식·스키마·LLM 호출 수 변경 없음(ADR-090 경계) |
| Runtime | 100% | 2026-10-06 재실행: unit 188 files 1906 passed · lint blocking 0 · `tsc --noEmit` 0 · build(2026-10-05 기록) · V16 실제 Groq 5회 overview 기준 통과 |
| **Overall** | **100%** | 15 + 25 + 25 + 35 (gap-detector 정적 97%는 SC3 재실행 전 수치) |

## 2. 전략 정합

- WHY 충족: 화면에 나오는 overview 문장은 원문 문자열이거나 검증된 항목 문장 또는 고정 문구다. V16 5회에서 문서 밖 문장 0, CANARY 0.
- RISK: 대체는 사용자 화면에 경고로 드러나지 않는다(`status_reason`은 문서 요약 화면에서 쓰지 않음, `components/document-assistant.tsx`). 대체 시 overview는 원문의 핵심 문장 1~2개가 된다.
- 결정 준수: overview 필드 유지·문자열 검증 대체(ADR-090 대안 A·B·C 기각 이유 그대로).

## 3. Gap 목록과 처리

| # | 심각도 | 내용 | 처리 |
|---|---|---|---|
| — | Critical/Important | 없음 | — |
| M1 | Minor | V16 스크립트 종료 코드 1(전체 금지 문자열 판정 6건) — 문서에 실제 있는 심은 문장의 항목·카드 채택 | ADR-090 경계로 기록(step0.md R1). 후속 검토 대상 |
| M2 | Minor | chunk·최종 단계 각각 +1로 `dropped`가 최대 2 | 설계 위반 아님, 화면 비노출. 유지 |
| M3 | 참고 | `mergeDocumentSummaries` 단독 호출 시 overview 검증 없음 | 호출처는 검증된 입력을 쓰는 `mergeVerifiedDocumentSummaries` 하나이고 최종 출력을 재검증 |

root 리뷰: V16 하니스에 overview 전용 판정(`overviewSentencesNotInDocument`, `overviewForbidden`)을 추가해 SC2를 직접 측정하게 했다.

## 4. Plan Success Criteria

| SC | 상태 | 근거 |
|---|---|---|
| SC1 단위 테스트 red→green | ✅ | U1~U5, red 5 failed → green 10 passed |
| SC2 V16 overview CANARY·문서 밖 문장 0 | ✅ | `v16-2026-10-06.json` 5/5 |
| SC3 lint·test·build | ✅ | 2026-10-06 lint·unit·tsc 재실행, build 2026-10-05 |

## 5. 남는 위험 (수용, ADR-090 경계)

- 문서 안에 실제로 들어 있는 지시문·주장 문장은 원문 문자열 검증을 통과해 요약 항목·카드·overview(대체 경로 포함)에 나올 수 있다. V16 5/5에서 key_points 채택, overview 2/5. 사람 검토 표시 등 별도 결정이 필요하다.

## 6. 다음

일치율 ≥ 90% → iterate 불필요. `/pdca report document-overview-grounding` → PR → 운영 반영은 사용자 승인 뒤.
