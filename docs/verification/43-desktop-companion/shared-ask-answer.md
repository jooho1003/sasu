# Step 4 — shared-ask-answer 검증 기록

- 실행일: 2026-10-02 KST
- 범위: 웹 ASK 시작과 답변 조회의 공용 함수 추출. 운영 DB, 배포, LLM 호출은 수행하지 않았다.

## 변경 내용

- `lib/ask-start.ts`: 마스킹, 1,000자 제한, `ask_question` RPC 오류 변환, 기존 worker handler 등록과 `kickWorker()`를 웹·데스크톱 공용 함수로 이동했다.
- `lib/answer-view.ts`: 질문자·부서 범위 조회와 현재 RLS에서 다시 보이는 원문·결정 인용 검사를 공용 함수로 이동했다. 인용이 없거나 하나라도 사라지면 기존과 같이 전체 답을 `refused`로 바꾼다.
- 두 웹 Route Handler는 멤버십을 `ActorContext`로 바꾼 뒤 공용 함수를 호출하는 어댑터만 남겼다. 기존 ASK의 `202 { ok, answer_id, job_id, truncated }`, 일일 한도 `429 { error, message }`, 답변 오류 본문과 캐시 헤더 부재를 유지하도록 `jsonResult`의 레거시 응답 모드를 제한적으로 사용했다.

## TDD 및 경계 확인

1. 구현 전 `npx vitest run tests/ask-start.test.ts tests/answer-view.test.ts`는 새 모듈이 없어 2개 suite가 실패했다.
2. 테스트를 먼저 추가한 뒤 구현했다. 최종 공용 모듈 + 기존 route 경계 실행:

   ```text
   npx vitest run tests/ask-start.test.ts tests/answer-view.test.ts tests/ask-daily-limit-route.test.ts tests/answer-read-boundary.test.ts
   4 files, 14 tests passed
   ```

3. `tests/ask-daily-limit-route.test.ts`, `tests/answer-read-boundary.test.ts`는 수정하지 않았고 통과했다.

## 의존 관계 확인

Graft와 Archify 실행 파일은 현재 작업공간 PATH 및 저장소 검색에서 찾지 못했다. 따라서 이 step에서는 대체로 `rg`로 전후 관계를 확인했다.

- 호출자: `components/ask-s4.tsx` → `/api/d/[dept]/ask`, `/api/d/[dept]/answers/[id]`
- 이전: 두 Route Handler가 각각 마스킹·RPC/worker 배선 및 답변/인용 재검사를 직접 소유
- 이후: Route Handler → `actorFromMembership()` → `startAsk()` 또는 `readAnswerView()` → 기존 Supabase 세션 클라이언트와 기존 pipeline/인용 보조 함수

공용 lib에는 `next/navigation`·`next/headers` import가 없고, `can_see()` 판정을 TypeScript로 복제하지 않았다.

## Acceptance Criteria

| 명령 | 결과 |
|---|---|
| `npx vitest run tests/ask-start.test.ts tests/answer-view.test.ts` | 2 files, 7 tests passed |
| `npm run lint` | 성공. 기존 ESLint 경고 2개와 wording 비차단 경고만 출력 |
| `npm run build` | 성공. TypeScript와 Next.js production build 통과 |
| `npm run test` | 177 files, 1,818 tests passed |
| `node scripts/review-qa.mjs ui-regression` | 검증용 서버를 띄워 실행. ASK가 포함된 공개 데모·게스트 흐름은 통과했으나, 이 step과 무관한 심사 계정 3개·채용 데모 3개·기존 화면 회귀가 실패/시간 초과하여 전체는 통과하지 못했다. 실패 중에는 `/demo/notion` client reference manifest 누락(Next.js invariant)도 확인됐다. |
| `E2E_BASE_URL=http://localhost:3011 npx playwright test tests/e2e/product-continuity.spec.ts --grep '질문 기록'` | 2 passed (1440px, 390px), API는 합성 응답만 사용 |
| `git diff --check` | 통과 |

넓은 `ui-regression` 실패는 공용 ASK/답변 로직의 단위·기존 route 경계·해당 비LLM 브라우저 흐름과 분리되어 있다. 실패 원인은 이 step에서 변경하지 않았다.
