# Step 6: jobs-worker

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` **§3.2 무거운 일은 전부 job이다** — 이 step의 명세다 (job 9종 목록 포함)
- `/docs/ARCHITECTURE.md` **§8**(`lib/jobs.ts`는 **TDD 대상**) · **§6 불변식 12·13**
- `/docs/PRD.md` **§6-11 "비동기 실행 모델"** · **§6-1 `jobs` 테이블** · **§6-10 "동시에 두 번 눌렀을 때 / 중간에 끊겼을 때"**
- `/docs/ADR.md` **ADR-009**(jobs 테이블 워커, Edge Function 배제) · **ADR-010**(매분 트리거는 D0 판정)
- `/docs/setup-guide.md` **§2**(트리거 판정 표) · **§10 D8 코드 리뷰 2번** — 사람이 이 코드를 직접 읽는다
- 이전 step 산출물: `lib/supabase/service.ts`(step 4) · `lib/llm.ts`(step 5) · `supabase/migrations/0001_schema_v1.sql`의 `jobs` 테이블(step 1)

## 작업

**이 step은 TDD 대상이다.** `tests/jobs.test.ts`를 먼저 쓰고 `lib/jobs.ts`를 만든다. Supabase는 mock한다.

### 1. `supabase/migrations/0003_claim_jobs.sql`

`FOR UPDATE SKIP LOCKED`는 supabase-js로 표현할 수 없다. SQL 함수로 만들고 rpc로 부른다.

```sql
create or replace function claim_jobs(p_limit int)
returns setof jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$ ... $$;
```

동작: `status = 'queued' and run_after <= now()`인 행을 `for update skip locked`로 `p_limit`개 집어 `status = 'running'`, `attempts = attempts + 1`, `updated_at = now()`로 바꾸고 그 행들을 반환한다. 한 트랜잭션 안에서 끝낸다.

### 2. `lib/jobs.ts` (TDD 대상)

```ts
export type JobKind =
  | "classify" | "embed" | "summarize_meeting" | "make_card"
  | "answer" | "send_slack" | "notion_import" | "slack_backfill" | "sweep";

export async function enqueue(
  kind: JobKind, payload: unknown, opts?: { dedupeKey?: string; runAfter?: Date },
): Promise<string>;

export function registerHandler(kind: JobKind, fn: (payload: any) => Promise<void>): void;

export async function runOnce(limit?: number): Promise<{ claimed: number; done: number; failed: number }>;
```

**`runOnce()`가 지켜야 할 것** (D8 사람 리뷰 2번 항목이다):

- `claim_jobs` rpc로 집는다. 애플리케이션에서 select 후 update하는 방식은 두 워커가 같은 job을 집는다.
- 성공 → `status = 'done'`.
- 실패 → `attempts < 3`이면 `status = 'queued'` + **지수 백오프**로 `run_after` 갱신(예: 2^attempts 초, 지터 포함), `last_error`에 **에러 코드만** 기록(본문 금지).
- **3회 실패 → `status = 'failed'` + 소유 row의 status를 함께 바꾼다.** 이게 PRD §6-10 표의 "분류는 `unclassified`, 카드는 `needs_review`, 답변은 `failed`"가 나오는 지점이다. kind별 매핑을 한 곳에 표로 둬라:
  - `classify` → `classifications.label = 'unclassified'`
  - `make_card` → `decision_requests.status = 'needs_review'`
  - `answer` → `answers.status = 'failed'` + `error_code`
- 등록되지 않은 kind → 즉시 `failed`, `last_error = 'unknown_kind'`. 조용히 넘기지 마라.

**`sweep` 핸들러**: 2분 넘게 `pending`인 `answers`와 `decision_requests`를 `failed(llm_timeout)` / `needs_review`로 정리한다. 영원히 도는 스피너를 없애는 것이 목적이다 (PRD §6-5 ⑦).

**task 0에서 실제로 등록하는 핸들러는 `sweep` 하나다.** `classify`는 step 9, `make_card`는 step 12에서 각자 등록한다. `embed`·`summarize_meeting`·`send_slack`·`notion_import`·`slack_backfill`은 뒤 task의 몫이라 이 step에서는 **타입에만 존재**하고 핸들러가 없다(= `unknown_kind`로 실패). 이건 의도된 상태다.

### 3. `app/api/jobs/run/route.ts`

- `x-jobs-secret` 헤더가 `process.env.JOBS_TRIGGER_SECRET`과 **상수 시간 비교**로 일치할 때만 처리. 불일치는 401. 시크릿이 설정되지 않았으면 500(조용히 통과시키지 마라).
- 일치하면 `runOnce()`를 돌리고 `{claimed, done, failed}`를 JSON으로 반환.
- `export const dynamic = "force-dynamic"`. 캐시되면 워커가 안 돈다.

### 4. `after()` 배선 헬퍼

`lib/jobs.ts`에 `export function kickWorker(): void`를 두고, 내부에서 `next/server`의 `after(() => runOnce())`를 호출한다. 요청 핸들러는 (1) 검증 (2) DB 쓰기 (3) `enqueue` (4) `kickWorker()` (5) 응답 순서로 쓴다 (ARCHITECTURE §3.2). 슬랙 3초 규칙이 여기 걸린다.

### 5. 매분 트리거는 이 step이 아니다

Vercel Cron이냐 Supabase `pg_cron`이냐는 **아직 판정되지 않았다** (ADR-010, setup-guide §2). `vercel.json`을 만들지 마라. 배선은 step 15에서 판정 결과에 따라 한다. `after()`만으로도 세로 슬라이스는 돈다.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
```

`tests/jobs.test.ts`에 아래 케이스가 실제로 있어야 한다:

```bash
npx vitest run tests/jobs.test.ts --reporter=verbose
#   - 실패한 job 은 attempts 증가와 함께 run_after 가 지수적으로 뒤로 밀린다
#   - 3회 실패하면 status=failed 이고 소유 row status 가 kind별 매핑대로 바뀐다
#   - 등록되지 않은 kind 는 unknown_kind 로 즉시 failed 가 된다
#   - sweep 은 2분 넘은 pending answers 를 failed(llm_timeout) 으로 바꾼다
#   - last_error 에 원문이 들어가지 않는다 (에러 코드만)
```

```bash
grep -q "claim_jobs" supabase/migrations/0003_claim_jobs.sql || { echo "FAIL: claim_jobs 함수 없음"; exit 1; }
grep -q "skip locked" supabase/migrations/0003_claim_jobs.sql || { echo "FAIL: SKIP LOCKED 없음"; exit 1; }
test ! -f vercel.json || { echo "FAIL: 트리거 배선은 step 15 다"; exit 1; }
grep -q "x-jobs-secret" app/api/jobs/run/route.ts || { echo "FAIL: 워커 인증 없음"; exit 1; }
echo "OK: jobs worker"
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트 — **D8 사람 리뷰(setup-guide §10)의 2번 항목을 미리 통과시켜라**:
   - `FOR UPDATE SKIP LOCKED`로 집는가? (애플리케이션 select-then-update가 아닌가)
   - 지수 백오프가 있는가?
   - 3회 실패 시 소유 row의 status를 갱신하는가?
   - 2분 스윕이 있는가?
   - 워커 라우트가 시크릿 헤더로 인증하고, 시크릿 미설정 시 통과시키지 않는가?
   - `lib/jobs.ts`에서 Groq SDK를 직접 부르지 않는가? (`lib/llm.ts`만 부른다)
3. `phases/0-vertical-slice/index.json`의 step 6을 업데이트한다:
   - 성공 → `"completed"` + `"summary"`에 `enqueue`/`registerHandler`/`runOnce`/`kickWorker` 시그니처와 등록된 핸들러 목록
   - 실패 → `"error"` + `"error_message"`
   - 사용자 개입 필요 → `"blocked"` + `"blocked_reason"`

## 금지사항

- `vercel.json`이나 `pg_cron` 스케줄을 만들지 마라. 이유: 매분 트리거는 D0 판정이 끝나지 않았다 (ADR-010, setup-guide §2). step 15의 범위다.
- Supabase Edge Function을 만들지 마라. 이유: ADR-009 — 런타임 2개를 1인이 관리하지 않는다.
- 외부 큐 서비스(QStash·Upstash 등)를 추가하지 마라. 이유: ADR-009에서 기각됐다.
- `last_error`에 에러 원문이나 페이로드 본문을 넣지 마라. 이유: 슬랙 메시지 본문이 그대로 남는다 (PRD §6-9).
- job 실패를 조용히 삼키지 마라. 이유: 항목을 버리지 않고 `unclassified`/`needs_review`/`failed`로 남기는 것이 PRD §6-10의 원칙이다.
- 워커 라우트를 인증 없이 열지 마라. 이유: 누구나 워커를 돌려 비용을 태울 수 있다.
- 기존 테스트를 깨뜨리지 마라.
