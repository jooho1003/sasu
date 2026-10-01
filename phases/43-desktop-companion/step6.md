# Step 6: companion-routes

## 읽어야 할 파일

- `docs/PRD.md` §3-8 DC-05~DC-09·§11 "데스크톱 동반 앱" 행
- `docs/ARCHITECTURE.md` §6 불변식 2·3·5·9·10·16, §6-11 불변식 45~48
- `docs/ADR.md` ADR-081 결정 5·6·8
- `docs/02-design/features/desktop-companion.design.md` §4(E05~E13)·§4.1·§5.2·§6·§7(S3)
- step 2·4·5 산출물: `lib/companion/{context,device-context}.ts`, `lib/{ask-start,answer-view,card-view,card-decide,transcript-upload}.ts`, `scripts/verify-companion-auth.mjs`
- `app/api/d/[dept]/questions/route.ts`(`my_question_history`), `app/api/d/[dept]/reviews/route.ts`·`reviews/[id]/parts/route.ts`(`create_review`·`queue_review_part`), `lib/contracts.ts`(`AskQuestionInput`·`ReviewCreate`)
- `supabase/migrations/0001_schema_v1.sql`(`answers`·`decision_requests`), `0034_reviewed_materials.sql`(상태 값)

## 작업

1. 테스트 먼저 `tests/companion/inbox.test.ts`, 그다음 `lib/companion/inbox.ts`:
   ```ts
   export function buildInbox(rows: InboxRows, now: Date): CompanionInbox; // 순수 정규화
   export async function loadInbox(ctx: ActorContext & { linkId: string }): Promise<Result<CompanionInbox>>;
   ```
   - `answers`: `asked_by = ctx.userId`, `dept_id = ctx.deptId`, 최근 24시간 — `{id, status, created_at}`만(질문 원문 없음).
   - `decision_requests`: `assignee_id = ctx.userId`, `status = 'open'`(lead면 `needs_review` 포함) — `{id, title, deadline, status}`.
   - `reviewed_materials`(lead만): `created_by = ctx.userId`, 최근 24시간, `deleted` 제외 — `{id, kind, title, status}`.
   - `sales`는 빈 배열(step 7에서 채움). 모든 조회는 `ctx.client`(사용자 JWT) — RLS가 가시성을 판정한다.
2. `lib/contracts.ts`에 `CompanionInbox`·`CompanionTranscriptMeta` 등 `Companion*` 스키마를 추가한다.
3. 경로(모두 `requireDeviceContext` → 공용 lib 또는 RPC → `jsonResult`, 헤더 `private, no-store`):
   - E05 `app/api/companion/inbox/route.ts` GET → `loadInbox`
   - E06 `ask/route.ts` POST → `startAsk`
   - E07 `answers/[id]/route.ts` GET → `readAnswerView`
   - E08 `questions/route.ts` GET → `my_question_history`(웹과 같은 페이지 크기)
   - E09 `cards/[id]/route.ts` GET → `loadCardView`
   - E10 `cards/[id]/decide/route.ts` POST → `decideCard`(웹과 같은 본문 스키마)
   - E11 `transcripts/route.ts` POST → `Content-Length`·파일 크기 4MB 초과면 본문을 읽기 전에 413 `too_large` → `ingestTranscript`
   - E12 `reviews/route.ts` POST → `ReviewCreate` → `create_review`(웹 경로와 같은 인자·오류 매핑) → 201 `{id}`
   - E13 `reviews/[id]/parts/route.ts` POST → `{index}` → `queue_review_part` + 핸들러 등록·`kickWorker` → 202
4. `scripts/verify-companion-api.mjs`(로컬 QA 전용) — LLM 없이 시드로 검증:
   - **웹과 같은 답**: 시드한 `done` 답변(dept 인용 1·`leads_only` 인용 1)을 lead·member 각각 웹 쿠키 경로와 앱 Bearer 경로로 읽어 본문이 같다. member 쪽에는 `leads_only` 인용이 0건(refused 포함 동일).
   - 결정: 앱으로 같은 카드 결정 2회 → `decisions` 1건 · 다른 부서 카드 404 · 담당 아닌 member 403.
   - inbox: 담당 카드가 `cards`에, 본인 답만 `answers`에 · 다른 사용자 항목 0.
   - 업로드: member의 전사·검토 등록 403 · lead 전사 4MB 초과 413 · lead 문서 검토 등록 201 → (스크립트가 같은 Bearer 세션으로 Storage 업로드) → parts 202.
   - 해제 뒤 모든 E05~E13 401.
5. 결과는 `docs/verification/42-desktop-companion/companion-routes.md`.

## 코드 관계와 구조 확인

Graft로 `app/api/companion/**`가 공용 lib만 부르고 권한 판정 코드를 새로 쓰지 않았는지 확인한다. 누락은 기록한다.

## Acceptance Criteria

```powershell
npx vitest run tests/companion
npm run lint
npm run build
npm run test
node scripts/verify-companion-auth.mjs
node scripts/verify-companion-api.mjs
git diff --check
```

## 검증 절차

1. AC 실행.
2. 체크리스트: `app/api/companion/**`에 service role 0(전사 수집 어댑터 내부 제외) · 부서는 `ctx`에서만 · 로그에 본문·질문·파일 내용 없음 · 문구 검사 통과.
3. `phases/42-desktop-companion/index.json` step 6을 갱신한다.

## 금지사항

- 질문 접수·답 인용·카드 근거·결정·전사 로직을 앱 경로에 다시 쓰지 마라. 이유: 불변식 47 — 공용 lib 하나만 부른다.
- inbox에 질문 원문·답 본문·카드 배경을 넣지 마라. 이유: 30초마다 오가는 요약이며, 내용은 해당 화면에서만 연다.
- SSE·WebSocket·롱폴링을 만들지 마라. 이유: 불변식 48·ARCHITECTURE §7.
- 앱 경로에서 Storage 서명 URL을 service role로 만들지 마라. 이유: 앱은 기기 세션으로 직접 업로드하고 Storage RLS가 판정한다.
- 기존 테스트를 깨뜨리지 마라.
