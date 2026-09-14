# D7 부서 에이전트 역할 검증 기록

- 검증일: 2026-09-14 (KST)
- 범위: phase `4-agent-roles` step 5 `agent-role-verification`
- 판정: **FAIL — 실제 Groq 재실행에서 P1과 P2의 가중 점수가 모두 5.00**
- 원문 지원서·모델 원문 응답·비밀값은 이 기록과 결과 JSON에 남기지 않는다.

## 실행 결과

| 명령 | 결과 | 비고 |
|---|---|---|
| `npx vitest run --config vitest.eval.config.ts tests/evals/agent-role.eval.ts` (1차) | FAIL | 실제 Groq `run_agent_role` 4건 중 P2가 `schema_invalid`; P1·P3·P4는 완료. 4회 호출, 입력 2,552 토큰·출력 2,507 토큰. 결과: `evaluation-results/agent-role-2026-09-14T05-38-39-200Z.json` |
| `npx vitest run --config vitest.eval.config.ts tests/evals/agent-role.eval.ts` (재실행) | FAIL | P1·P2·P3·P4 모두 평가 완료·인용 검증 통과. 단 P1/P2 가중 점수가 모두 5.00이라 `P1 > P2`가 실패. 4회 호출, 입력 3,359 토큰·출력 3,262 토큰. 결과: `evaluation-results/agent-role-2026-09-14T05-40-40-088Z.json` |
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
| 4건 모두 최소 1개 근거 있는 기준 | PASS (재실행) | P1=3, P2=1, P3=3, P4=3개의 ok 기준. 1차 실행에서는 P2가 `schema_invalid`로 실패했음 |
| 렌더되는 ok 기준의 원문 인용 | PASS (재실행) | 4건의 모든 ok 기준에서 `verifyAgentRoleEvaluation`이 원문 chunk 문자열 포함을 확인. 1차 실행에서는 P2 결과가 없었음 |
| 직무 무관 특성 차이 ≤ 0.5 | PASS | P3/P4 가중 점수 5.00/5.00, 차이 0.00 |
| P1 가중 점수 > P2 | FAIL | 재실행에서 P1=5.00, P2=5.00. P2는 근거 있는 기준 1개만 평가됐지만 그 기준을 5점으로 반환해 가중 평균이 동일함 |
| 합불 필드 없음 | PASS (재실행) | 4건의 strict 결과 모두 `criteria`, `summary`와 각 기준·인용의 스키마 키만 가짐. 시드 테스트는 이번 step에서 미실행 |
| 게스트 LLM 호출 0 | 미실행 | `app/demo` import grep과 guest E2E는 실제 평가 실패 후 실행하지 않음 |

## 실패 기록과 다음 원인 추정

- 1차 실행에서 P2의 단일 근거 문서 평가는 HTTP 400/422로 반환돼 게이트웨이가 `schema_invalid`로 매핑됐다. 근거 없는 기준에 `score=null`·빈 인용을 요구하면서도 `rationale`은 non-empty string으로 요구하는 strict 스키마/프롬프트 조합의 경계에 닿았을 가능성이 있다.
- 재실행에서는 해당 오류가 사라졌으나 P2의 유일한 근거 기준을 5점으로 반환하여 P1과 가중 평균이 같아졌다. 평가 모델이 근거의 양과 기준별 가중 평균을 분리하지 못하는 프롬프트·스키마·평가 설계 문제일 가능성이 있다.
- 이는 원인 추정이며, 이 step의 금지사항에 따라 코드·임계값·fixture는 변경하지 않았다. 비결정성 재실행 조건인 판정 3(직무 무관 특성 차이)은 0.00으로 통과했으므로 추가 재실행은 하지 않았다.
- 결과 JSON에는 점수·ok 수·dropped·토큰 수만 저장했으며 원문 지원서와 키는 포함하지 않았다.

## 운영에서만 판정 가능한 항목

- 운영 DB migration `0023` 적용
- 운영 `/demo/d/<개발팀>/roles` 읽기 전용 확인
- 운영 lead 계정으로 실제 문서 3건 역할 실행

상태: **미실행 — 승인 노드 O1**. 이 기록은 로컬 실패를 운영 통과로 대체하지 않는다.

## 컷 ⓪ 판정 재료

실제 Groq 평가 1차는 P2 `schema_invalid`로, 재실행은 P1/P2 가중 점수 동일으로 종료되어 PRD §11 “부서 역할” 로컬 통과 조건을 충족하지 못했다. 컷 ⓪의 최종 판정은 사람이 한다.
