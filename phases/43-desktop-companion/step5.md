# Step 5: shared-card-transcript

## 읽어야 할 파일

- `docs/ARCHITECTURE.md` §3.1·§3.5·§4.2·§4.4, §6 불변식 3·4·7·8·13·14·16, §6-11 불변식 47
- `docs/ADR.md` ADR-081 결정 5·8
- `docs/02-design/features/desktop-companion.design.md` §4(W03~W05)·§4.1
- step 2·4 산출물: `lib/companion/context.ts`, `lib/ask-start.ts`(옮기는 방식의 예)
- `app/(auth)/d/[dept]/cards/[id]/page.tsx`(근거·충돌·자료 검토 조회와 인용 포함 필터 :100~210 부근)
- `app/api/cards/[id]/decide/route.ts`(전체 226줄 — canAct·중복 결정·`decide_request`·오류 매핑)
- `app/api/d/[dept]/meetings/transcript/route.ts`(전체 99줄), `lib/adapters/upload.ts`(`insertUploadedItems`)
- 세 곳을 다루는 기존 테스트·E2E(결정 연타 → decisions 1건)

## 작업

step 4와 같이 웹 동작을 바꾸지 않고 코드 위치만 옮긴다.

1. 테스트 먼저: `tests/card-view.test.ts`, `tests/card-decide.test.ts`, `tests/transcript-upload.test.ts`.
2. `lib/card-view.ts`
   ```ts
   export async function loadCardView(ctx: ActorContext, cardId: string): Promise<Result<CardView>>;
   ```
   카드(`dept_id = ctx.deptId`) + 근거 + 충돌 + 자료 검토 메타를 읽고 quote가 원문에 포함된 인용만 남기는 기존 로직을 그대로 옮긴다. 카드 페이지는 이 함수를 쓴다.
3. `lib/card-decide.ts`
   ```ts
   export async function readCardDept(client: SupabaseClient, cardId: string): Promise<string | null>; // 웹 경로가 멤버십을 고르기 전에 사용
   export async function decideCard(ctx: ActorContext, cardId: string, body: DecideBody): Promise<Result<DecideResponse>>;
   ```
   카드 부서 ≠ `ctx.deptId`면 404. lead 또는 `assignee_id = ctx.userId`만 행동, reopen은 lead만, `needs_review`는 lead만 — 기존 규칙 그대로. 기존 결정이 있으면 중복 응답, RPC `decide_request`, 오류 매핑(42501→403, 23514→409, P0002→404, 22023→400) 그대로.
4. `lib/transcript-upload.ts`
   ```ts
   export async function ingestTranscript(ctx: ActorContext, file: File, meta: { title: string; visibility: "dept"|"leads_only" }): Promise<Result<{ job_ids: string[] }>>;
   ```
   lead 전용 · 10MB · `.vtt/.txt` · `is_demo_department` · **동의한 화자 발언만 저장** · 마스킹 · `insertUploadedItems`(수집 어댑터, 불변식 16) · job 등록 순서를 그대로 옮긴다.
5. 세 웹 진입점(페이지 1, 경로 2)을 얇게 바꾼다. 응답·리다이렉트·화면 결과가 이전과 같아야 한다.
6. 결과는 `docs/verification/42-desktop-companion/shared-card-transcript.md`.

## 코드 관계와 구조 확인

Graft로 카드 페이지·결정 경로·전사 경로의 의존과 호출자를 전후 비교한다. 누락은 기록한다.

## Acceptance Criteria

```powershell
npx vitest run tests/card-view.test.ts tests/card-decide.test.ts tests/transcript-upload.test.ts
npm run lint
npm run build
npm run test
node scripts/review-qa.mjs ui-regression
git diff --check
```

- PRD §11 "엣지·에러" 행: 결정 버튼 연타 → decisions 1건 + 중복 응답이 기존 E2E 또는 새 lib 테스트로 확인된다.
- 미동의 화자 발언이 저장되지 않는 기존 테스트가 통과한다.

## 검증 절차

1. AC 실행.
2. 체크리스트: 미동의 발언 미저장 · service role은 `insertUploadedItems` 안에만 · 인용 없는 문장 렌더 없음 · 결정 append-only.
3. `phases/42-desktop-companion/index.json` step 5를 갱신한다.

## 금지사항

- 결정 권한(lead/담당자)·인용 필터·동의 화자 필터를 바꾸지 마라. 이유: 이동만 하는 step이다.
- `insertUploadedItems` 밖에서 service role을 쓰지 마라. 이유: 불변식 2·16.
- 미동의 멤버 발언을 이름만 가리고 저장하는 방식으로 바꾸지 마라. 이유: CLAUDE.md CRITICAL.
- 기존 테스트를 깨뜨리지 마라.
