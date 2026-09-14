# D7 부서 에이전트 역할 검증 기록

- 검증일: 2026-09-14 (KST)
- 범위: phase `4-agent-roles` step 5 `agent-role-verification`
- 판정: **FAIL — 실제 Groq 평가에서 P2가 `schema_invalid`로 종료**
- 원문 지원서·모델 원문 응답·비밀값은 이 기록과 결과 JSON에 남기지 않는다.

## 실행 결과

| 명령 | 결과 | 비고 |
|---|---|---|
| `npx vitest run --config vitest.eval.config.ts tests/evals/agent-role.eval.ts` | FAIL | 실제 Groq `run_agent_role` 4건 중 P2가 `schema_invalid`; P1·P3·P4는 완료. 4회 호출, 입력 2,552 토큰·출력 2,507 토큰. 결과: `evaluation-results/agent-role-2026-09-14T05-38-39-200Z.json` |
| `npm run lint` | 미실행 | 실제 평가 실패 후 step 규칙에 따라 중단 |
| `npx tsc --noEmit` | 미실행 | 실제 평가 실패 후 step 규칙에 따라 중단 |
| `npm run test` | 미실행 | 실제 평가 실패 후 step 규칙에 따라 중단 |
| `npm run build` | 미실행 | 실제 평가 실패 후 step 규칙에 따라 중단 |
| `node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"` | 미실행 | 실제 평가 실패 후 step 규칙에 따라 중단 |
| `npm run e2e -- tests/e2e/guest.spec.ts tests/e2e/agent-roles.spec.ts` | 미실행 | 실제 평가 실패 후 step 규칙에 따라 중단 |
| 클라이언트 번들 비밀값 검사 | 미실행 | build를 실행하지 않음 |

## PRD §11 “부서 역할” 판정

| 항목 | 판정 | 근거 |
|---|---|---|
| RLS: member INSERT 거부, leads_only 결과 select 0건 | 미실행 | `verify-security-sql`은 실제 Groq 평가 실패 후 실행하지 않음 |
| 4건 모두 최소 1개 근거 있는 기준 | FAIL | P2가 `schema_invalid`로 결과를 만들지 못함. P1·P3·P4는 각각 ok 기준 3개 |
| 렌더되는 ok 기준의 원문 인용 | 부분 PASS / 전체 FAIL | 완료된 P1·P3·P4의 검증 인용은 모두 원문 chunk 문자열 포함. P2 결과 없음 |
| 직무 무관 특성 차이 ≤ 0.5 | PASS | P3/P4 가중 점수 5.00/5.00, 차이 0.00 |
| P1 가중 점수 > P2 | FAIL | P2 결과 없음 |
| 합불 필드 없음 | 부분 PASS / 전체 FAIL | 완료된 P1·P3·P4의 strict 결과는 스키마 밖 키가 없었음. P2 결과 없음; 시드 테스트는 이번 step에서 미실행 |
| 게스트 LLM 호출 0 | 미실행 | `app/demo` import grep과 guest E2E는 실제 평가 실패 후 실행하지 않음 |

## 실패 기록과 다음 원인 추정

- P2의 단일 근거 문서 평가에서 Groq 요청이 HTTP 400/422로 반환돼 게이트웨이가 `schema_invalid`로 매핑했다. 해당 후보는 근거가 없는 기준에 `score=null`·빈 인용을 요구하면서도 `rationale`은 non-empty string으로 요구하는 현재 strict 스키마/프롬프트 조합의 경계에 닿았을 가능성이 있다.
- 이는 추정이며, 이 step의 금지사항에 따라 코드·임계값·fixture는 변경하지 않았다. 비결정성 판정 3(직무 무관 특성 차이)은 첫 실행에서 통과했으므로 재실행 조건이 아니다.
- 결과 JSON에는 점수·ok 수·dropped·토큰 수만 저장했으며 원문 지원서와 키는 포함하지 않았다.

## 운영에서만 판정 가능한 항목

- 운영 DB migration `0023` 적용
- 운영 `/demo/d/<개발팀>/roles` 읽기 전용 확인
- 운영 lead 계정으로 실제 문서 3건 역할 실행

상태: **미실행 — 승인 노드 O1**. 이 기록은 로컬 실패를 운영 통과로 대체하지 않는다.

## 컷 ⓪ 판정 재료

실제 Groq 평가가 P2 `schema_invalid`로 종료되어 PRD §11 “부서 역할” 로컬 통과 조건을 충족하지 못했다. 컷 ⓪의 최종 판정은 사람이 한다.
