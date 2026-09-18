# Step 4: candidate-submit-score

지원자 제출 라우트, 채점 job 연결, 부서장 점수표의 "지원자 제출" 탭.

## 읽어야 할 파일

- `/docs/ADR.md` ADR-062 3~4항 · ADR-045 4항 · `/docs/ARCHITECTURE.md` 불변식 3·9·21 · §5 "긴 작업은 row 먼저, job으로"
- `docs/planning/예고편_지원자링크_설계.md` §3·§5
- step 0 RPC(`submit_trailer_invite_attempt`·`withdraw_trailer_invite_attempt`·`requeue_trailer_attempt_score`) · step 1 계약 · step 3 `trailer-invite-flow.tsx`
- `lib/pipeline/trailer-score.ts`(핸들러·service role은 워커 내부에서만) · `lib/trailer-assessment.ts`(`validateAttemptSubmissions`·`verifyTrailerScore`·`ASSESSMENT_FORBIDDEN_WORDS`·`ASSESSMENT_FIXED_COPY`) · `lib/jobs.ts` 19·98·314행
- `app/(auth)/d/[dept]/trailers/_data.ts` 32~36행(`readTrailerAttempts`의 `.eq("kind","synthetic")`) · `components/trailers/attempt-scores.tsx` · `app/(auth)/d/[dept]/trailers/[id]/page.tsx` 18~20행(탭)
- `app/api/d/[dept]/ask/route.ts`(검증 → DB 쓰기 → `after(runWorkerOnce)` → 응답 패턴)

## 작업

### 1. 제출·철회 라우트

- `POST /api/t/i/submit` 본문 `SubmitTrailerInviteBody`. 순서: Zod → `trailer_invite_open`으로 현재 시나리오를 다시 받아 `validateAttemptSubmissions(scenarios, submissions)` → `submit_trailer_invite_attempt`(anon 클라이언트) → `after(runWorkerOnce)` → 202 `{state:"submitted"}`. 본문 상한 64KB(초과는 413). 응답·로그에 `attempt_id`를 내보내지 않는다(지원자에게 필요 없다).
- `POST /api/t/i/withdraw` 본문 `{token,email}` → `withdraw_trailer_invite_attempt` → 204.
- 두 라우트 모두 `no-store`, 오류 코드만, 로그에 이유 원문·이메일·토큰 없음. 같은 토큰의 연속 제출은 RPC가 `already_submitted`로 막는다 — 라우트에서 별도 멱등 처리 불필요.

### 2. 워커

- `lib/pipeline/trailer-score.ts`는 `kind`를 보지 않으므로 수정 없이 candidate를 채점해야 한다. **확인만** 하고, 프롬프트 입력에 `label`·`invite_id`가 들어가지 않는지 점검(들어가면 제거).
- `lib/jobs.ts`의 실패 매핑(98행)·스윕(314행)이 candidate 행에도 적용됨을 테스트로 확인.
- 채점 결과 검증(`verifyTrailerScore`)은 그대로. 금지어 문장 제거도 그대로.

### 3. 부서장 점수표

- `_data.ts`: `readTrailerAttempts(trailerId, kind: "synthetic" | "candidate")`로 분기. 기존 호출은 `"synthetic"`.
- `attempt-scores.tsx`: `kind` prop. `candidate`일 때 `aria-label="지원자 제출 점수표"`, 고정 문구는 `ASSESSMENT_FIXED_COPY` 대신 "실제 지원자의 제출입니다. 점수는 면접 질문을 준비하기 위한 참고 자료이며 합격 여부의 기준이 아닙니다." — **정렬 토글을 렌더하지 않는다**(제출순 고정). 라벨은 attempt의 비식별 `label`("지원자 01")과 초대 목록의 이메일을 `invite_id`로 조인해 표시(부서장 화면이므로 이메일 표시 가능).
- `[id]/page.tsx`: "합성 지원자" 탭 옆에 "지원자 제출" 탭(`trailerInvitesEnabled()`이고 `published`일 때만). 채점 실패 행에 [다시 채점](step 2 라우트).

### 4. 테스트

- `tests/trailer-invite-submit-route.test.ts`: Zod 실패 400 · 시나리오 불일치 400(`invalid_attempt`) · 동의 전 → `consent_required` · 재제출 → `already_submitted` · 64KB 초과 413 · `after` 호출 확인 · 라우트 모듈이 `createServiceSupabaseClient`를 import하지 않음(정적 검사).
- `tests/trailer-assessment.test.ts` 확장: candidate 행 채점 입력에 `label`·`invite_id` 없음.
- `tests/e2e/trailer-invite-page.spec.ts` B(`E2E_TRAILER_INVITES=1`, QA 조직 플래그 on): 부서장 발급 → 새 컨텍스트(쿠키 없음)로 링크 열기 → 이메일 확인 → 동의 → 3퀘스트 → 최종 제출 → 부서장 화면 "지원자 제출" 탭에 행 1개 · 채점 완료까지 대기(120초) · 점수순 정렬 컨트롤 없음 · 지원자 페이지 재방문 시 완료 화면·점수 없음 · 철회 → 부서장 목록 `withdrawn`·attempt 0행.

## Acceptance Criteria

```bash
npm run lint && npx tsc --noEmit && npm run test
npx playwright test tests/e2e/trailer-invite-page.spec.ts tests/e2e/trailer-assessment.spec.ts --config playwright.trailer.config.ts   # A 통과, B skipped(플래그 없음)
npm run build
```

## 금지사항

- 제출 라우트에서 `enqueue()`(lib/jobs.ts)를 부르지 마라. 이유: `enqueue`는 service role 클라이언트를 쓴다. job insert는 RPC 안에서 이미 된다.
- 지원자 제출 탭에 점수순 정렬·순위·"상위 n명" 같은 표시를 넣지 마라. 이유: ADR-062 4항·ADR-045.
- 채점 프롬프트에 이메일·라벨·초대 id를 넣지 마라. 이유: 목적 외 이용·불변식 9.
