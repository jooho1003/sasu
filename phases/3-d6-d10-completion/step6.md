# Step 6: ask-daily-limit

## 읽어야 할 파일

- `/docs/PRD.md` §6-5 ASK, §6-9 "`/api/d/[dept]/ask`는 사용자당 하루 50회 상한", §6-10 엣지 케이스 표
- `app/api/d/[dept]/ask/route.ts`, `components/ask-s4.tsx`
- `supabase/migrations/0014_atomic_slack_ingest.sql`(슬랙 @멘션이 answers row를 만드는 곳), `lib/pipeline/answer.ts`(슬랙 회신)
- 음성 질문 경로 `app/api/d/[dept]/voice/route.ts`(ASK로 전달하는지 확인)

## 작업

상한은 **한 곳**에서 집행한다: answers INSERT.

1. 마이그레이션 `supabase/migrations/0021_ask_daily_limit.sql`
   - `BEFORE INSERT` 트리거 on `answers`: `asked_by`의 오늘(Asia/Seoul 자정 기준) answers 수가 50 이상이면 `raise exception 'ask_daily_limit' using errcode = 'P0001'`. `asked_by is null`(시드 등)이면 통과. 게스트 org 부서는 해당 없음(게스트는 insert 자체가 없다).
   - 인덱스 `answers(asked_by, created_at)`.
2. 웹 ask 라우트: 예외를 `429 { error: "ask_daily_limit", message: "오늘 질문 한도(50회)를 모두 사용했습니다. 내일 다시 물어봐 주세요." }`로 매핑. S4는 message를 표시하고 입력을 막지 않는다(다음날 풀림).
3. 슬랙 경로: `ingest_slack_atomic`이 이 예외로 롤백되면 이벤트 멱등 기록까지 롤백되어 슬랙 재전송 때마다 반복된다. 해결: 상한 초과는 **정상 종료**로 처리 — RPC가 예외를 잡아 이벤트는 기록하고 answer·job은 만들지 않은 채 `{status:'rate_limited'}`를 반환하게 하고, 라우트는 스레드에 위 문구를 1회 회신(봇 토큰 `chat.postMessage`, 기존 post 헬퍼). 0014 함수를 **새 마이그레이션에서 `create or replace`**로 교체.
4. 테스트 먼저: SQL(50번째 허용·51번째 거부·KST 자정 경계·다른 사용자 독립·슬랙 RPC rate_limited 반환 + ingest_events 기록 + answers 0) + 웹 라우트 429 매핑 테스트 + 슬랙 라우트 회신 1회 테스트(외부 호출은 mock).

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"   # failed 0
```

## 검증 절차

1. AC 실행. 2. 체크리스트(슬랙 3초 ack 유지 · 로그에 질문 원문 금지 · 상한 판정 SQL 한 곳). 3. index.json step 6 갱신.

## 금지사항

- 상한 카운트를 애플리케이션 메모리·쿠키로 하지 마라. 이유: 서버리스 인스턴스마다 다르고 우회 가능.
- 기존 마이그레이션 파일 수정 금지(교체는 새 파일의 create or replace) · 운영 반영 금지.
