# D7 부서 에이전트 역할 검증 기록

- 검증일: 2026-09-14 (KST, 재실행)
- 범위: phase `4-agent-roles` step 6 `agent-role-verification` 재실행
- 판정: **PASS (로컬)**. 번들 비밀값 검사의 FAIL은 오탐으로 재판정했다(아래 "비밀값 검사 재판정", Claude 리뷰 2026-09-14). 역할 UI 인증 E2E 2건은 skipped라 운영 확인(O1)에서 보완한다
- 원문 지원서·모델 원문 응답·질문·비밀값은 이 기록과 결과 JSON에 남기지 않는다.

## 이전 실행

이전 실행은 1차 실제 Groq 평가에서 P2가 `schema_invalid`로 끝났고, 2차에서는 P1과 P2가 모두 5.00점으로 `P1 > P2`가 실패했다. 이에 따라 Step 5에서 전체 기준 가중치 합을 분모로 사용하고, 근거 없는 기준의 `rationale`을 nullable로 검증하도록 점수식과 계약을 정정했다. 이 기록은 해당 이전 결과를 대체하는 재실행 기록이다.

## 실행 결과

| 명령 | 결과 | 비고 |
|---|---|---|
| `npm run lint` | PASS | 종료 코드 0, 21.2초 |
| `npx tsc --noEmit` | PASS | 종료 코드 0, 10.1초 |
| `npm run test` | PASS | 44개 파일, 729개 테스트, 3.66초. Vite 설정 경고만 출력 |
| `npm run build` | PASS | 종료 코드 0, Next.js 16.3.4 production build 완료 |
| `node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"` | PASS | 59/59 시나리오, 2,016 assertions. `0004_worker_cron.sql`은 PGlite에서 제외 |
| `npx vitest run --config vitest.eval.config.ts tests/evals/agent-role.eval.ts` | PASS | 실제 Groq 평가 4/4 통과. 결과: `evaluation-results/agent-role-2026-09-14T10-55-59-155Z.json` (입력 3,483 / 출력 4,048 토큰, 4회 호출) |
| `npm run e2e -- tests/e2e/guest.spec.ts tests/e2e/agent-roles.spec.ts` | PASS (부분) | 게스트 4/4 통과. 인증 E2E 환경 부재로 역할 UI 2건 skipped |
| 클라이언트 번들 비밀값 검사 | PASS (재판정) | step 실행 시 service-role 키 prefix 8자 1건 → 오탐. 전체 키·뒤 24자·JWT payload는 0건 |

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
| 클라이언트 비밀값 미노출 | PASS (재판정) | 아래 재판정 참조 |

## 비밀값 검사 재판정 (Claude 리뷰, 2026-09-14)

step 6은 각 키의 앞 8자로 검사했다. Supabase의 `SUPABASE_SERVICE_ROLE_KEY`와 `NEXT_PUBLIC_SUPABASE_ANON_KEY`는 둘 다 JWT라 앞 8자가 같은 헤더(`eyJhbGci…`)다. 로컬 `.env`로 다시 대조했다.
- 두 키의 앞 8자는 일치한다.
- `.next/static` 427개 파일 중 anon 키 전체 문자열이 든 파일이 1개이고, 앞 8자가 검출된 파일도 그 1개다. anon 키는 클라이언트 공개가 허용된 값이다(CLAUDE.md).
- service-role 키 전체 문자열, 뒤 24자, JWT payload 세그먼트는 **0건**이다.

결론: 검출 1건은 공개 anon 키의 JWT 헤더와 겹친 오탐이다. service-role 키는 번들에 없다. 이후 JWT 형식 키는 앞 8자가 아니라 payload·서명 세그먼트로 검사한다. 키 값은 이 기록에 남기지 않았다.

## 운영에서만 판정 가능한 항목

- 운영 DB migration `0023` 적용
- 운영 `/demo/d/<개발팀>/roles` 읽기 전용 확인
- 운영 lead 계정으로 실제 문서 3건 역할 실행

상태: **미실행 — 승인 노드 O1**. 이 step은 운영 DB·Vercel·Slack에 쓰지 않았다.

## 컷 ⓪ 판정 재료

역할 기준표의 실제 Groq·RLS·게스트·번들 비밀값(재판정) 로컬 검증을 통과했다. 인증된 역할 UI E2E 2건은 로컬 인증 환경이 없어 skipped다. 컷 ⓪의 최종 판정은 사람이 한다.
