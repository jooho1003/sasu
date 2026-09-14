# Step 5: agent-role-scoring-fix

## 읽어야 할 파일

- `/docs/ADR.md` **ADR-038**의 "총점" 문장 (9/14 정정본)
- `/docs/PRD.md` §6-1 `agent_role_results.weighted_score` 주석
- `docs/verification/D7-agent-roles.md` (이전 검증 실패 기록: P2 `schema_invalid`, P1=P2=5.00)
- `lib/contracts.ts` `AgentRoleEvaluation`, `lib/agent-role.ts`, `tests/agent-role.test.ts`
- `lib/pipeline/agent-role.ts`, `tests/pipeline/agent-role.test.ts`
- `components/agent-roles.tsx`, `app/demo/d/[dept]/roles/page.tsx`
- `scripts/seed-demo.ts`, `tests/seed-demo.test.ts`

## 배경

이전 실제 Groq 평가에서 두 가지 설계 결함이 드러났다.

1. `weightedScore`가 근거 있는 기준만으로 평균을 낸다. 그래서 기준 1개만 근거가 있고 5점인 문서가 기준 3개 모두 5점인 문서와 같은 점수(5.00)가 된다. 점수표로서 틀린 정의다.
2. `AgentRoleEvaluation.criteria[].rationale`이 non-empty string이다. 근거가 없는 기준(score null, citations [])에도 모델이 이유 문장을 강제로 만들어야 해서 strict 출력이 실패(`schema_invalid`)할 여지가 있다.

## 작업

TDD: 테스트를 먼저 고친 뒤 구현한다.

1. `lib/agent-role.ts` `weightedScore(criteria)`
   - 새 정의: `Σ(ok 기준 score × weight) / Σ(전체 criteria weight)`
   - `no_evidence` 기준은 분자에 0으로 들어가고 분모에는 포함된다.
   - 소수 둘째 자리 반올림.
   - `ok` 기준이 0개면 `null`. 이 경우 파이프라인은 기존대로 `failed(citation_invalid)`다.
   - 검증된 criteria는 역할의 모든 기준을 담는다(누락 기준은 `no_evidence`). 따라서 분모는 역할 전체 가중치와 같다.
   - 테스트 예:
     - 기준 가중치 3·4·2에서 셋 다 5 → 5.00
     - 가중치 4인 기준만 5이고 나머지 근거 없음 → round(20/9, 2) = 2.22
     - 전부 근거 없음 → null
     - 기존 "근거 있는 것만 평균" 기대값 테스트는 새 정의로 바꾼다.
2. `lib/contracts.ts` `AgentRoleEvaluation`
   - `rationale`을 `NullableString`으로 바꾼다 (빈 문자열 금지, null 허용).
   - `tests/contracts.test.ts`의 strict schema 검사가 계속 통과해야 한다.
3. `lib/agent-role.ts`
   - `AGENT_ROLE_SYSTEM_GUARD` 1번 문장을 다음으로 바꾼다: "각 기준의 score는 0~5 정수입니다. 문서에서 근거를 찾지 못한 기준은 score와 rationale을 null로, citations를 빈 배열로 둡니다."
   - 여기에 "근거가 일부만 있는 기준은 5점을 주지 말고 근거의 구체성에 맞게 낮게 매기세요." 한 줄을 6번으로 추가한다.
   - `verifyAgentRoleEvaluation`: `ok` 판정에 rationale이 non-null이어야 한다는 조건을 추가한다. rationale이 null이면 `no_evidence`.
4. 화면: `components/agent-roles.tsx`와 `app/demo/d/[dept]/roles/page.tsx`
   - "근거 없음" 셀과 상세 표기를 **"근거 없음 (0점 반영)"**으로 바꾼다.
   - 점수표 고정 문구 아래에 작은 설명 한 줄을 추가한다: "가중 점수 = 기준별 점수×가중치 합 ÷ 전체 가중치. 근거 없는 기준은 0점."
   - 게스트 페이지의 summary 렌더도 `ok` 기준이 1개 이상일 때만 하도록 맞춘다.
5. 시드: `scripts/seed-demo.ts`의 `weighted_score`는 이미 `weightedScore()`로 계산하므로 값이 자동으로 바뀐다. `tests/seed-demo.test.ts`의 기대값·순서 검사가 있으면 새 정의에 맞춘다. 지원자 A > B > C 순서가 유지되는지 테스트로 확인한다.
6. `lib/pipeline/agent-role.ts`와 테스트: rationale null 케이스를 1개 추가한다.

## Acceptance Criteria

```bash
npx vitest run tests/agent-role.test.ts tests/pipeline/agent-role.test.ts tests/contracts.test.ts tests/seed-demo.test.ts
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

명령은 **하나씩 순서대로** 실행한다. 병렬 실행하지 마라. 이유: 이 PC는 메모리가 부족해 이전 실행이 강제 종료됐다.

## 검증 절차

1. AC를 실행한다.
2. 체크리스트: 총점을 모델이 내지 않는가 · 근거 없는 기준의 rationale이 렌더되는 경로가 없는가.
3. `phases/4-agent-roles/index.json` step 5를 갱신한다.

## 금지사항

- 실제 Groq 평가(`tests/evals/agent-role.eval.ts`)의 임계값·fixture를 바꾸지 마라. 이유: 판정 기준은 step 6이 그대로 다시 돌린다.
- DB 스키마(0023)를 바꾸지 마라. 이유: `weighted_score numeric`과 check(0~5)는 새 정의에서도 유효하다.
