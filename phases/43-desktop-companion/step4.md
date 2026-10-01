# Step 4: shared-ask-answer

## 읽어야 할 파일

- `docs/ARCHITECTURE.md` §3.3·§3.5·§4.3, §6 불변식 1·2·5·9·10, §6-12 불변식 48
- `docs/ADR.md` ADR-082 결정 5, ADR-051·066·067(답 인용 계약)
- `docs/02-design/features/desktop-companion.design.md` §2(설계안 C)·§4(W01·W02)·§4.1
- step 2 산출물: `lib/companion/context.ts`(`ActorContext`, `Result`, `actorFromMembership`, `jsonResult`)
- `app/api/d/[dept]/ask/route.ts`(전체 80줄), `app/api/d/[dept]/answers/[id]/route.ts`(전체 161줄 — 특히 :63~152 인용 재검사)
- `lib/mask.ts`, `lib/jobs.ts`(`kickWorker`), `lib/pipeline/*`의 `register*Handler`
- 이 두 경로를 다루는 기존 테스트(`tests/ask-daily-limit-route.test.ts` 등 `grep -l "answers\|ask" tests`)

## 작업

웹 동작을 **바꾸지 않고** 코드 위치만 옮긴다. 앱 경로(step 6)가 같은 함수를 부르게 하려는 것이다.

1. 테스트 먼저: `tests/ask-start.test.ts`, `tests/answer-view.test.ts`. 기존 route 테스트의 사례(마스킹·1000자 자르기·429·403·202 본문, pending의 빈 인용·현재 가시성 재검사·사라진 인용이면 refused·404)를 lib 수준으로 옮긴다.
2. `lib/ask-start.ts`
   ```ts
   export async function startAsk(ctx: ActorContext, input: AskQuestionInput): Promise<Result<{ answer_id: string; job_id: string; truncated: boolean }>>;
   ```
   마스킹 → 1000자 → RPC `ask_question(p_dept: ctx.deptId, …)` → 오류 매핑(P0001→429 `ask_daily_limit`, 42501→403) → 기존 `register*Handler()` 전부 → `kickWorker()` → 202.
3. `lib/answer-view.ts`
   ```ts
   export async function readAnswerView(ctx: ActorContext, answerId: string): Promise<Result<AnswerView>>;
   ```
   기존 :63~152의 조회(`asked_by = ctx.userId`, `dept_id = ctx.deptId`)·인용 재검사(활성 소스·미삭제·quote 포함·결정 인용)·refused 전환을 그대로 옮긴다. `AnswerView` 타입은 지금 응답 본문과 같다.
4. 두 웹 경로를 얇게 바꾼다: `requireMembership` → `actorFromMembership` → lib 호출 → `jsonResult`. 상태 코드·본문·헤더가 이전과 바이트 단위로 같아야 한다.
5. 기존 묻기 E2E(`tests/e2e/`에서 ask·answer·grounded를 다루는 spec 중 LLM 없이 도는 것)를 review-qa 경유로 실행한다. 결과는 `docs/verification/43-desktop-companion/shared-ask-answer.md`.

## 코드 관계와 구조 확인

Graft로 두 경로의 호출자(컴포넌트 `components/ask-s4.tsx` 등)와 옮긴 함수의 의존을 전후 비교한다. 누락은 기록한다.

## Acceptance Criteria

```powershell
npx vitest run tests/ask-start.test.ts tests/answer-view.test.ts
npm run lint
npm run build
npm run test
node scripts/review-qa.mjs ui-regression
git diff --check
```

- 기존 route 테스트가 수정 없이 통과한다(수정했다면 summary에 이유).

## 검증 절차

1. AC 실행.
2. 체크리스트: 인용 검증 로직을 바꾸지 않았는가 · `can_see()` 판정을 TS로 복제하지 않았는가 · lib에 `next/navigation`·`next/headers` import가 없는가.
3. `phases/43-desktop-companion/index.json` step 4를 갱신한다.

## 금지사항

- 인용 재검사·refused 조건을 고치거나 "개선"하지 마라. 이유: 이 step은 이동만 한다. 계약 변경은 ADR이 먼저다.
- `lib/ask-start.ts`·`lib/answer-view.ts`에서 쿠키·`redirect()`를 쓰지 마라. 이유: 앱 경로가 같은 함수를 쓴다.
- LLM을 부르는 E2E를 AC로 돌리지 마라. 이유: 비용·한도. 기존 비LLM 회귀만 쓴다.
- 기존 테스트를 깨뜨리지 마라.
