# Step 8: slack-adapter

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` **§3.1 어댑터는 items를 먼저 저장한다** — 이 step의 명세다 (어댑터의 일은 넷뿐이다)
- `/docs/ARCHITECTURE.md` **§4.1 슬랙 메시지 한 건의 여정** · **§6 불변식 7·8·9·13** · **§8**(`lib/slack/verify.ts`와 `lib/adapters/*` 파서는 **TDD 대상**, `route.ts`는 비대상)
- `/docs/PRD.md` **§6-2 "슬랙"** 항목 — 수집·제외 대상이 전부 열거돼 있다
- `/docs/PRD.md` **§6-9 "비밀값 흐름"**(서명 검증·최소 스코프 8개) · **§6-10 "입력이 비었을 때"** 표
- `/docs/PRD.md` **§8-3**(동의가 수집보다 먼저) · **§11 엣지·에러 행**("같은 슬랙 이벤트 2회 전송 → items 1건")
- `/docs/ADR.md` **ADR-021**(미동의 발언 저장 안 함) · **ADR-017**(단일 워크스페이스)
- `/docs/setup-guide.md` **§4 슬랙 앱** · **§10 D8 코드 리뷰 3번** — 사람이 서명 검증 코드를 직접 읽는다
- 이전 step 산출물: `lib/contracts.ts`의 `IngestItem`(step 3) · `lib/supabase/service.ts`(step 4) · `lib/jobs.ts`의 `enqueue`/`kickWorker`(step 6) · `lib/mask.ts`의 `mask()`(step 7)

## 작업

### 1. `lib/slack/verify.ts` (TDD 대상)

```ts
export function verifySlackSignature(args: {
  rawBody: string; timestamp: string; signature: string; signingSecret: string; now?: Date;
}): boolean;
```

- 타임스탬프가 **5분 창** 밖이면 즉시 false (재전송 공격 차단)
- `v0:{timestamp}:{rawBody}`를 HMAC-SHA256으로 계산해 `v0=` 접두 서명과 비교
- **비교는 상수 시간으로** (`crypto.timingSafeEqual`). 길이가 다르면 먼저 false로 빠져나오되, 그 판단이 내용 비교보다 먼저여야 한다
- `now`를 인자로 받아 테스트에서 시간을 고정할 수 있게 한다

### 2. `lib/adapters/slack.ts` (TDD 대상 — 파서 부분)

```ts
export function toIngestItem(event: SlackMessageEvent, ctx: {
  sourceId: string; deptId: string;
}): IngestItem | null;          // 수집 제외 대상이면 null

export function isCollectible(event: SlackMessageEvent): boolean;
```

**제외 대상** (PRD §6-2, null을 반환한다):
- 봇 자신의 메시지 (`bot_id` 있음 / `subtype: "bot_message"`)
- 본문 없는 메시지 — 파일만·이모지만·채널 조인/퇴장 알림
- 스레드 답글은 **제외하지 않는다.** 부모와 묶는다 (`thread_ts`를 `external_ref` 계산이나 필드에 반영)

**어댑터가 하는 일은 넷뿐이다** (ARCHITECTURE §3.1): 서명 검증 → 동의 확인 → 마스킹 → `items` upsert + `enqueue`. **분류·임베딩·LLM을 여기서 부르지 마라.** 어댑터는 분류의 존재를 모른다.

`content`는 `mask()`를 통과한 값만 담는다. **마스킹 전 원문을 변수에 남겨 로그하거나 다른 필드에 넣지 마라.**

`external_ref`는 슬랙 `ts`. `unique (source_id, external_ref)`가 폴링·재전송 중복을 막는다.

### 3. 동의 확인 — 이 step에서 가장 중요한 규칙

`author_ext_id`(슬랙 user id)로 `members`를 조회해 **`consented_at`이 null이면 그 메시지를 저장하지 않는다** (ADR-021). 이름만 가리고 본문을 저장하는 방식은 금지다. 매핑 자체가 없는 슬랙 사용자도 마찬가지로 저장하지 않는다.

동의 확인은 `items` insert **이전**이어야 한다. insert 후 지우는 방식은 저장이 이미 일어난 것이라 의미가 없다.

### 4. `app/api/slack/events/route.ts` (TDD 비대상)

순서를 지켜라:

1. **raw body를 문자열로 먼저 읽는다.** `request.json()`을 서명 검증 전에 부르지 마라 — 검증 전 파싱은 D8 리뷰 3번의 지적 항목이다
2. `verifySlackSignature()` → 실패면 **401** (본문을 보지 않는다)
3. `type: "url_verification"`이면 `challenge`를 그대로 200으로 반환 (setup-guide §4의 Request URL 등록에 필요하다)
4. `ingest_events`에 `event_id` insert → **중복 키면 200으로 즉시 종료** (멱등)
5. `isCollectible` → 동의 확인 → `mask()` → `items` upsert(service role) → `enqueue("classify", {itemId})`
6. `kickWorker()` → **200**

**전 과정이 3초 안에 끝나야 한다.** 슬랙은 3초 내 200이 없으면 같은 이벤트를 재전송한다. 무거운 일은 전부 job이다.

`export const dynamic = "force-dynamic"`을 넣어라.

### 5. 이 step에서 만들지 않는 것

- `/api/slack/interactions`(버튼·모달) — task 1의 범위다
- Block Kit·`chat.postMessage` — task 1
- 7일 백필(`slack_backfill` job) — task 1, 컷 ① 대상
- `@사수` 멘션 Q&A — task 3

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
```

```bash
npx vitest run tests/slack/verify.test.ts tests/adapters/slack.test.ts --reporter=verbose
# 아래가 테스트 목록에 실제로 있어야 한다:
#   - 5분보다 오래된 타임스탬프의 요청을 거부한다
#   - 서명이 한 글자 다르면 거부한다
#   - 올바른 서명을 통과시킨다
#   - 봇 메시지·본문 없는 메시지·조인 알림을 수집 제외한다
#   - 스레드 답글은 수집한다
#   - 미동의 author_ext_id 의 메시지는 IngestItem 을 만들지 않는다
#   - content 는 mask() 를 통과한 값이다 (전화번호가 남아 있지 않다)
```

PRD §11 "엣지·에러" 행의 판정 기준을 이 step이 만족시킨다 — **같은 슬랙 이벤트를 2회 전송하면 items가 1건이어야 한다.** 실제 DB 검증은 step 14/15에서 하지만, `ingest_events` 멱등 경로가 코드에 있는지는 여기서 확인한다:

```bash
grep -q "ingest_events" app/api/slack/events/route.ts || { echo "FAIL: event_id 멱등 처리 없음"; exit 1; }
grep -q "url_verification" app/api/slack/events/route.ts || { echo "FAIL: challenge 응답 없음"; exit 1; }
# 서명 검증 전에 json() 을 부르지 않는가 — verify 호출이 json 파싱보다 앞서야 한다
echo "OK: slack adapter"
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트 — **D8 사람 리뷰(setup-guide §10)의 3번 항목을 미리 통과시켜라**:
   - 타임스탬프 5분 창이 있는가?
   - HMAC 비교가 상수 시간인가?
   - **검증 전에 본문을 파싱하지 않는가?**
   - 미동의 멤버의 발언이 저장되지 않는가? (insert 이전에 걸러지는가)
   - `items.content`가 마스킹 후 값인가? 마스킹 전 원문이 어디에도 남지 않는가?
   - 어댑터가 분류·LLM을 부르지 않는가? (ARCHITECTURE §3.1)
   - 로그에 이벤트 본문이 나가지 않는가? (ID·길이·에러 코드만)
3. `phases/0-vertical-slice/index.json`의 step 8을 업데이트한다:
   - 성공 → `"completed"` + `"summary"`에 라우트 경로·export 함수·처리 순서 요약
   - 실패 → `"error"` + `"error_message"`
   - 사용자 개입 필요 → `"blocked"` + `"blocked_reason"`

## 금지사항

- 서명 검증 전에 `request.json()`을 부르지 마라. 이유: 검증되지 않은 입력을 파서에 먹이는 것이고, D8 사람 리뷰의 명시 항목이다.
- HMAC을 `===`로 비교하지 마라. 이유: 타이밍 공격 경로다. `crypto.timingSafeEqual`을 써라.
- 미동의 멤버의 메시지를 "이름만 가리고" 저장하지 마라. 이유: ADR-021 — RLS는 접근 통제이지 수집의 법적 근거가 아니다. 근거는 동의다.
- 마스킹 전 원문을 변수·로그·다른 컬럼에 남기지 마라. 이유: ARCHITECTURE §6 불변식 9.
- 라우트에서 분류·LLM·임베딩을 직접 실행하지 마라. 이유: 슬랙 3초 규칙을 넘기고, 어댑터의 책임 경계를 무너뜨린다 (ARCHITECTURE §3.1·§3.2).
- 슬랙 OAuth 설치 흐름("Add to Slack")을 만들지 마라. 이유: ADR-017 — 단일 워크스페이스 수동 설치로 확정됐다.
- 이 step에서 `/api/slack/interactions`·Block Kit·백필을 만들지 마라. 이유: task 1의 범위다. 한 step은 한 모듈만 다룬다.
- 기존 테스트를 깨뜨리지 마라.
