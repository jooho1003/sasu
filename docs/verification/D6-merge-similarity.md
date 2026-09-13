# D6 카드 병합 유사도 실측

- 실행 시각: 2026-09-13T01:58:13.046Z
- 공급자·모델: Voyage AI `voyage-4-lite` (1024차원, `input_type=document`)
- 고정 병합 임계값: 0.85 (PRD §6-3 ⑥, 이 측정으로 변경하지 않음)

| fixture | 기대 관계 | 코사인 유사도 | 0.85 이상 |
|---|---|---:|---|
| same-vendor-quote | same | 0.746298 | 아니오 |
| same-qa-contract | same | 0.637122 | 아니오 |
| same-release-rollback | same | 0.868091 | 예 |
| different-vendor-interview | different | 0.399304 | 아니오 |
| different-release-lunch | different | 0.465349 | 아니오 |
| different-qa-hiring | different | 0.408501 | 아니오 |

## 요약

- 같은 안건 3쌍 최소값: **0.637122**
- 다른 안건 3쌍 최대값: **0.465349**
- 같은 안건 중 임계값 미만: **2쌍**
- 다른 안건 중 임계값 이상: **0쌍**

이 문서는 합성 fixture의 1회 실측 기록이다. 임계값 판정과 변경은 사람의 후속 결정 및 ADR 대상으로 남긴다.
