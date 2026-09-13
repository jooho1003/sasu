# D7 카드 병합 LLM 확인 평가

- 실행 시각: 2026-09-13T08:07:08.800Z
- fixture: `fixtures/evaluation/merge-similarity-extended.json` (문장·라벨 변경 없음)
- 임베딩: Voyage AI `voyage-4-lite` (`input_type=document`)
- 후보 임계값: 0.55
- 확인 모델: Groq `openai/gpt-oss-20b`, `llm.structured("merge_confirm")`, strict json_schema
- 카드 구성: 왼쪽 원문을 제목·배경에 그대로 사용하고 같은 원문 인용 1건을 첨부, 오른쪽 원문을 새 item으로 사용
- 운영 DB 쓰기: 0건. `llm_calls` POST는 로컬 HTTP 캡처로 검증

| fixture | 기대 관계 | 유사도 | LLM 판정 | 최종 병합 |
|---|---|---:|---|---|
| same-b-quote-increase | same | 0.759854 | true | 예 |
| same-b-quote-deadline | same | 0.742122 | true | 예 |
| same-beta-date | same | 0.719607 | true | 예 |
| same-qa-budget | same | 0.587898 | true | 예 |
| same-cloud-capacity | same | 0.580941 | true | 예 |
| same-security-review | same | 0.693456 | true | 예 |
| same-mobile-scope | same | 0.615743 | true | 예 |
| same-support-hours | same | 0.728959 | true | 예 |
| same-office-move | same | 0.721183 | true | 예 |
| same-data-retention | same | 0.783609 | true | 예 |
| hard-b-quote-vs-signer | hard-different | 0.580305 | false | 아니오 |
| hard-b-contract-vs-scope | hard-different | 0.739181 | false | 아니오 |
| hard-beta-date-vs-announcement | hard-different | 0.841596 | false | 아니오 |
| hard-qa-budget-vs-test-cases | hard-different | 0.536668 | 미호출 | 아니오 |
| hard-cloud-capacity-vs-region | hard-different | 0.704222 | false | 아니오 |
| hard-security-review-vs-owner | hard-different | 0.656179 | false | 아니오 |
| hard-mobile-scope-vs-platform | hard-different | 0.693023 | false | 아니오 |
| hard-support-hours-vs-routing | hard-different | 0.759399 | false | 아니오 |
| hard-office-move-vs-seating | hard-different | 0.773623 | false | 아니오 |
| hard-data-retention-vs-access | hard-different | 0.698410 | false | 아니오 |
| different-hiring-interview | different | 0.406863 | 미호출 | 아니오 |
| different-team-lunch | different | 0.329111 | 미호출 | 아니오 |
| different-office-supplies | different | 0.355027 | 미호출 | 아니오 |
| different-finance-workshop | different | 0.498176 | 미호출 | 아니오 |

## 요약

| 지표 | 결과 |
|---|---:|
| same 병합 | 10/10 |
| hard-different 오병합 | 0/10 |
| different 오병합 | 0/4 |
| 전체 오병합 | 0 |
| `llm.structured` 호출 수 | 19 |
| 로컬 캡처 `llm_calls` 행 수 | 19 |

**ADR-037 게이트: 통과** — 기준은 오병합 0건 및 same 병합 7/10 이상이다.

이 결과는 고정 합성 fixture의 1회 실측이며 문자열 인용 검증이나 실제 파일럿 데이터 정확도를 대신하지 않는다.
