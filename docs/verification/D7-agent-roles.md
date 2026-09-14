# D7 부서 에이전트 역할 검증 기록

- 검증일: 2026-09-14 (KST)
- 범위: phase `4-agent-roles` step 6 `agent-role-verification` 재실행
- 판정: **FAIL — 프로덕션 클라이언트 번들에서 `SUPABASE_SERVICE_ROLE_KEY` 앞 8자가 1건 검출**
- 원문 지원서·모델 원문 응답·질문·비밀값은 이 기록과 결과 JSON에 남기지 않는다.

## 이전 실행

이전 실행은 1차 실제 Groq 평가에서 P2가 `schema_invalid`로 끝났고, 2차에서는 P1과 P2가 모두 5.00점으로 `P1 > P2`가 실패했다. 이에 따라 Step 5에서 전체 기준 가중치 합을 분모로 사용하고, 근거 없는 기준의 `rationale`을 nullable로 검증하도록 점수식과 계약을 정정했다. 이 기록은 해당 이전 결과를 대체하는 재실행 기록이다.

## 실행 결과

| 명령 | 결과 | 비고 |
|---|---|---|
| `npm run lint` | PASS | 종료 코드 0, 9.25초 |
| `npx tsc --noEmit` | PASS | 종료 코드 0, 4.17초 |
| `npm run test` | PASS | 44개 파일, 729개 테스트, 4.99초. Vite 설정 경고만 출력 |
| `npm run build` | PASS | Next.js 16.3.4 production build 성공, 9.29초 |
| `node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"` | PASS | 59/59 시나리오, 2,016 assertions. `0004_worker_cron.sql`은 PGlite에서 제외 |
| `npx vitest run --config vitest.eval.config.ts tests/evals/agent-role.eval.ts` | PASS | 실제 Groq 평가 4/4 통과. 결과: `evaluation-results/agent-role-2026-09-14T10-48-53-505Z.json` |
| `npm run e2e -- tests/e2e/guest.spec.ts tests/e2e/agent-roles.spec.ts` | PASS (부분) | 게스트 4/4 통과. 인증 E2E 환경 부재로 역할 UI 2건 skipped |
| 클라이언트 번들 비밀값 검사 | **FAIL** | service-role 키 prefix 1건. 나머지 4개 키 prefix는 각 0건 |

Vite 설정의 native loader 및 `vite-tsconfig-paths` 관련 경고와 Playwright의 `NO_COLOR` 경고만 있었고, 각 명령은 종료됐다.

## PRD §11 “부서 역할” 판정

| 항목 | 판정 | 근거 |
|---|---|---|
| RLS: member INSERT 거부, leads_only 결과 select 0건 | PASS | SQL 검증의 agent role 쓰기·가시성·실행 결과 케이스 통과 |
| 4건 모두 최소 1개 근거 있는 기준 | PASS | 실제 Groq 평가에서 P1=3, P2=1, P3=3, P4=3개의 `ok` 기준 |
| 렌더되는 ok 기준의 원문 인용 | PASS | 모든 `ok` citation이 chunk 원문에 포함되고, dropped=0 |
| 직무 무관 특성 차이 ≤ 0.5 | PASS | P3/P4 가중 점수 5.00/5.00, 차이 0.00 |
| P1 가중 점수 > P2 | PASS | P1=5.00, P2=2.50 |
| 합불 필드 없음 | PASS | 실제 Groq 응답 strict schema 키 검사 및 시드 테스트 통과 |
| 게스트 LLM 호출 0 | PASS (로컬) | `guest.spec.ts`의 게스트 열람 전후 AI 호출·DB 행 수 증가 없음 테스트 통과 |
| 클라이언트 비밀값 미노출 | **FAIL** | `SUPABASE_SERVICE_ROLE_KEY` prefix가 production client chunk에서 1건 검출 |

## 원인 추정 및 후속

검출 위치는 production client chunk 한 곳이다. 어떤 클라이언트 import 또는 환경 변수 참조가 service-role 값을 번들로 끌어들였는지의 원인 분석과 수정은 이 검증 전용 step 범위 밖이므로 수행하지 않았다. Step 6은 `error`로 종료한다. 후속 수정 step은 해당 chunk의 공개 경로를 추적하고, `lib/supabase/service.ts`와 client component import 경계를 점검한 뒤 전체 검증을 재실행해야 한다.

## 운영에서만 판정 가능한 항목

- 운영 DB migration `0023` 적용
- 운영 `/demo/d/<개발팀>/roles` 읽기 전용 확인
- 운영 lead 계정으로 실제 문서 3건 역할 실행

상태: **미실행 — 승인 노드 O1**. 이 step은 운영 DB·Vercel·Slack에 쓰지 않았다.

## 컷 ⓪ 판정 재료

역할 기준표의 실제 Groq·RLS·게스트 로컬 검증은 통과했지만, production client bundle의 service-role 키 노출 검사 실패로 PRD §11 전체 로컬 통과 조건을 충족하지 못했다. 컷 ⓪의 최종 판정은 사람이 한다.
