# Step 14: db-apply-seed

## 읽어야 할 파일

- `/docs/setup-guide.md` **§3 Supabase** — 마이그레이션은 `supabase/migrations/`에서만. 대시보드에서 스키마를 직접 고치지 않는다
- `/docs/PRD.md` **§11 "보안" 행** — 이 step이 만족시켜야 할 판정 기준이 그대로 적혀 있다
- `/docs/PRD.md` **§6-9 역할표** · **§6-1 RLS 원칙** · **§6-6**(멤버십은 시드·lead 지정으로만 생긴다)
- `/docs/ARCHITECTURE.md` **§8 테스트 경계 2행** — `tests/rls/*.test.ts`는 서로 다른 JWT 3개(anon·member·lead)로 같은 쿼리를 돌린다
- `/docs/ADR.md` **ADR-024**(`can_see()` 단일 판정) · **ADR-026**(완료는 실행 기록으로 판정)
- 이전 step 산출물: `supabase/migrations/0001_schema_v1.sql`(step 1) · `0002_can_see_rls.sql`(step 2) · `0003_claim_jobs.sql`(step 6) · `lib/supabase/service.ts`(step 4)

## 작업

여기서 처음으로 **살아 있는 DB**에 붙는다. 지금까지의 step은 전부 파일과 mock이었다.

### 0. 먼저 환경을 확인하고, 없으면 즉시 blocked

아래가 `.env.local`에 채워져 있어야 한다:

- `NEXT_PUBLIC_SUPABASE_URL` (이미 있음: `https://fzpnidoyhejrmhymggpp.supabase.co`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- 마이그레이션 적용 수단 — `SUPABASE_DB_URL`(Postgres 연결 문자열) **또는** `SUPABASE_ACCESS_TOKEN` + DB 비밀번호

하나라도 없으면 **추측하지 말고 즉시 `blocked`**로 표시하고 중단하라. `blocked_reason`에 **없는 변수 이름을 정확히 나열**하고, 어디서 얻는지 적어라 (Supabase 대시보드 → Settings → API / Settings → Database). 임의의 값으로 진행하지 마라.

`npx supabase login`처럼 **대화형 명령을 실행하지 마라** — 무인 실행에서 멈춘다. 토큰은 환경 변수로만 받는다.

### 1. 마이그레이션 적용

`npx supabase link --project-ref fzpnidoyhejrmhymggpp` 후 `npx supabase db push`. 또는 `SUPABASE_DB_URL`로 `psql`을 써도 된다. 어느 쪽이든 **`supabase/migrations/`의 파일이 진실**이고, 대시보드에서 손으로 고치지 마라 (setup-guide §13).

적용 후 확인:
- 테이블 15개 존재
- `can_see` 함수 존재
- `claim_jobs` 함수 존재
- 모든 테이블에 `rowsecurity = true`

### 2. `scripts/seed-dept.ts` — 우리 팀 부서 시드

`npx tsx scripts/seed-dept.ts`로 도는 멱등 스크립트를 만든다. service role로 실행한다(허용 경로다).

만드는 것:
- `orgs` 1건 — **`is_demo = false`** (우리 팀은 데모가 아니다)
- `departments` 1건 — `template: 'general'`
- `members` 2건 — lead 1명 + member 1명. `auth.admin.createUser()`로 계정을 만들고 `user_id`를 잇는다. **`consented_at`을 채워라** — 미동의면 어댑터가 발언을 저장하지 않아 세로 슬라이스가 돌지 않는다 (ADR-021)
- `sources` 2건 — 퍼블릭 슬랙 채널 1개(`visibility: 'dept'`) + **`leads_only` 소스 1개**. `leads_only` 소스는 RLS 테스트와 D9 컷 ⑦의 대체안("시드로 leads_only 소스 1개 고정")에 둘 다 쓰인다
- 각 소스에 `items` 몇 건 — RLS 테스트가 볼 대상

**멱등하게 만들어라.** 두 번 돌려도 중복이 생기지 않아야 한다(고정 UUID 또는 upsert). 시드 계정의 이메일·비밀번호는 `.env.local`의 별도 변수(`SEED_LEAD_EMAIL` 등)에서 읽고, **코드에 하드코딩하지 마라.**

### 3. `tests/rls/` — RLS 시나리오 테스트

`npm run test:rls`로만 도는 테스트다(기본 `npm test`에서 제외돼 있다 — step 0의 vitest `exclude`).

JWT 3개로 **같은 쿼리**를 돌린다:

| 주체 | 클라이언트 | 기대 |
|---|---|---|
| anon | anon key, 로그인 없음 | 우리 팀(`is_demo = false`) 데이터 **0건**. 쓰기 거부 |
| member | member 계정 로그인 세션 | `dept` 소스의 items는 보이고, **`leads_only` 소스의 items·citations·카드는 0건**. `leads_only` 카드 insert는 **거부**(WITH CHECK) |
| lead | lead 계정 로그인 세션 | `leads_only`까지 보인다 |

추가로:
- `jobs`·`ingest_events`·`llm_calls`·`orgs`를 member 세션으로 select → **0건 또는 권한 거부**
- 다른 부서 `dept_id`를 억지로 넣은 insert → 거부

이게 PRD §11 "보안" 행의 판정 기준이다. **통과하는 것처럼 보이면서 WITH CHECK가 빠져 있기 쉬우니**(setup-guide §13), insert 거부 케이스를 반드시 포함하라.

### 4. 이 step에서 하지 않는 것

- 게스트/데모 시드(`scripts/seed-demo.ts`) — task 5다. `is_demo = true` org를 만들지 마라
- 배포 · 슬랙 Request URL 등록 · 매분 트리거 — step 15다

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
```

```bash
npx supabase db push          # 또는 psql "$SUPABASE_DB_URL" -f ...
npx tsx scripts/seed-dept.ts  # 두 번 돌려도 결과가 같아야 한다
npx tsx scripts/seed-dept.ts
npm run test:rls              # 전부 통과
```

`npm run test:rls`에 아래 케이스가 실제로 있어야 한다:

```
- member 세션으로 leads_only items 를 select 하면 0건이다
- member 세션으로 leads_only 카드를 insert 하면 거부된다 (WITH CHECK)
- lead 세션으로 leads_only items 를 select 하면 보인다
- anon 으로 우리 팀(is_demo=false) 데이터를 select 하면 0건이다
- member 세션으로 jobs / ingest_events / llm_calls / orgs 를 select 하면 0건이거나 거부된다
- 다른 dept_id 를 지정한 insert 는 거부된다
```

## 검증 절차

1. 위 AC 커맨드를 순서대로 실행한다.
2. 아키텍처 체크리스트:
   - 마이그레이션 파일만으로 스키마가 재현되는가? (대시보드 수동 변경이 없는가)
   - 시드가 멱등인가? (두 번 실행 결과가 같은가)
   - 시드 계정 자격증명이 코드에 하드코딩되지 않았는가?
   - `leads_only` insert 거부 케이스가 테스트에 있는가? (WITH CHECK 누락은 select 테스트만으로는 안 잡힌다)
   - `is_demo = true` org를 만들지 않았는가?
3. `phases/0-vertical-slice/index.json`의 step 14를 업데이트한다:
   - 성공 → `"completed"` + `"summary"`에 적용한 마이그레이션 목록, 시드한 부서·멤버·소스 구성, RLS 테스트 결과
   - 실패 → `"error"` + `"error_message"`
   - **환경 변수 부재 등 사용자 개입 필요 → `"blocked"` + `"blocked_reason"`(없는 변수 이름을 정확히) 후 즉시 중단.** 중단 전에 **여기까지의 변경을 반드시 커밋하라** — blocked 경로에서는 실행기가 자동 커밋하지 않는다

## 금지사항

- 환경 변수가 없을 때 값을 추측하거나 임시 프로젝트를 만들지 마라. 이유: 잘못된 프로젝트에 스키마가 올라가면 되돌리기가 비싸다. 모르면 `blocked`다.
- `npx supabase login` 같은 대화형 명령을 실행하지 마라. 이유: 무인 실행이 멈춘다. 토큰은 환경 변수로 받는다.
- Supabase 대시보드에서 스키마를 고치지 마라. 이유: setup-guide §13 — 마이그레이션만이 진실이다.
- `DROP TABLE`·`truncate`로 기존 데이터를 밀지 마라. 이유: `scripts/hooks/dangerous-command-guard.sh`가 차단하고, 되돌릴 수 없다.
- `is_demo = true` org나 데모 데이터를 만들지 마라. 이유: 게스트 시드는 task 5이고, 우리 팀 실데이터와 데모 데이터가 섞이면 PRD §8-3의 "게스트에 실데이터 노출 금지"가 깨진다.
- RLS 테스트를 기본 `npm test`에 넣지 마라. 이유: 훅이 매 step 끝에 돌려서 DB 없는 환경의 step들이 전부 실패한다.
- 미동의(`consented_at` null) 멤버로 시드하지 마라. 이유: 어댑터가 발언을 저장하지 않아 세로 슬라이스가 돌지 않는다.
- 기존 테스트를 깨뜨리지 마라.
