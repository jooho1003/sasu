# D6 카드 병합 유사도 실측

- 실행 시각: 2026-09-13T07:37:23.611Z
- 공급자·모델: Voyage AI `voyage-4-lite` (1024차원, `input_type=document`)
- 고정 병합 임계값: 0.85 (PRD §6-3 ⑥, 이 측정으로 변경하지 않음)
- fixture: `fixtures/evaluation/merge-similarity-extended.json`

| fixture | 기대 관계 | 코사인 유사도 | 0.85 이상 |
|---|---|---:|---|
| same-b-quote-increase | same | 0.759854 | 아니오 |
| same-b-quote-deadline | same | 0.741903 | 아니오 |
| same-beta-date | same | 0.719607 | 아니오 |
| same-qa-budget | same | 0.588363 | 아니오 |
| same-cloud-capacity | same | 0.581817 | 아니오 |
| same-security-review | same | 0.693174 | 아니오 |
| same-mobile-scope | same | 0.615743 | 아니오 |
| same-support-hours | same | 0.728627 | 아니오 |
| same-office-move | same | 0.721183 | 아니오 |
| same-data-retention | same | 0.783609 | 아니오 |
| hard-b-quote-vs-signer | hard-different | 0.580305 | 아니오 |
| hard-b-contract-vs-scope | hard-different | 0.739076 | 아니오 |
| hard-beta-date-vs-announcement | hard-different | 0.841596 | 아니오 |
| hard-qa-budget-vs-test-cases | hard-different | 0.537217 | 아니오 |
| hard-cloud-capacity-vs-region | hard-different | 0.704222 | 아니오 |
| hard-security-review-vs-owner | hard-different | 0.656602 | 아니오 |
| hard-mobile-scope-vs-platform | hard-different | 0.692205 | 아니오 |
| hard-support-hours-vs-routing | hard-different | 0.759399 | 아니오 |
| hard-office-move-vs-seating | hard-different | 0.773623 | 아니오 |
| hard-data-retention-vs-access | hard-different | 0.698410 | 아니오 |
| different-hiring-interview | different | 0.407333 | 아니오 |
| different-team-lunch | different | 0.329111 | 아니오 |
| different-office-supplies | different | 0.355027 | 아니오 |
| different-finance-workshop | different | 0.498176 | 아니오 |

## 요약

| 기대 관계 | 최소 | 중앙값 | 최대 |
|---|---:|---:|---:|
| same | 0.581817 | 0.720395 | 0.783609 |
| hard-different | 0.537217 | 0.701316 | 0.841596 |
| different | 0.329111 | 0.381180 | 0.498176 |

### 임계값별 병합·오병합 수

| 임계값 | same 병합 | hard-different 오병합 | different 오병합 | 비-same 오병합 합계 |
|---:|---:|---:|---:|---:|
| 0.55 | 10 | 9 | 0 | 9 |
| 0.60 | 8 | 8 | 0 | 8 |
| 0.65 | 7 | 8 | 0 | 8 |
| 0.70 | 6 | 5 | 0 | 5 |
| 0.75 | 2 | 3 | 0 | 3 |
| 0.80 | 0 | 1 | 0 | 1 |
| 0.85 | 0 | 0 | 0 | 0 |

이 문서는 합성 fixture의 1회 실측 기록이다. 임계값 판정과 변경은 사람의 후속 결정 및 ADR 대상으로 남긴다.
