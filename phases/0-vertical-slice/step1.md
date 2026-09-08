# Step 1: schema-v1

## 읽어야 할 파일

- `/docs/PRD.md` **§6-1 데이터 모델** — 이 step의 산출물은 이 절의 SQL이다. 컬럼·주석·기본값까지 그대로 따른다
- `/docs/PRD.md` **§6-12 데이터·상태** — 상태 전이표(`decision_requests`·`decisions`·`meetings`·`jobs`·`answers`)와 "지워야 하는 것과 남겨야 하는 것"
- `/docs/ARCHITECTURE.md` **§5 상태** · **§6 불변식 13·14·15**
- `/docs/ADR.md` **ADR-018**(임베딩 컬럼은 D2 확정 후에만) · **ADR-022**(삭제 정책) · **ADR-023**(결정 append-only)
- 이전 step 산출물: `package.json` · `tsconfig.json` (step 0)

## 작업

`supabase/migrations/0001_schema_v1.sql` 하나를 만든다. RLS 정책과 SQL 함수는 이 step이 아니다 (step 2).

### 테이블 15개 — PRD §6-1 그대로

`orgs` · `departments` · `members` · `sources` · `meetings` · `items` · `ingest_events` · `classifications` · `decision_requests` · `decisions` · `citations` · `conflicts` · `answers` · `jobs` · `llm_calls`

`orgs.is_demo boolean not null default false`는 PRD가 `alter table`로 적었지만, 새로 만드는 스키마이므로 `create table orgs` 안에 처음부터 넣어라. 게스트 판별은 이름 문자열이 아니라 이 플래그다.

### 반드시 들어가야 하는 것

**멱등 장치 4개** (ARCHITECTURE §6 불변식 13 — 이걸 우회하는 insert 경로를 나중에도 만들지 않는다):

1. `ingest_events.event_id`가 primary key — 슬랙 이벤트 재전송 차단
2. `items`에 `unique (source_id, external_ref)` — 폴링·백필 중복 차단
3. `decisions.request_id`에 unique — 카드 1장 = 결정 1건 (더블클릭·동시 결정 차단)
4. `create unique index one_open_request_per_item on decision_requests (origin_item_id) where status = 'open'` — 같은 원본의 open 카드는 1장

**인덱스**: `create index jobs_claim on jobs (run_after) where status = 'queued'`

**탈퇴 대비** (ADR-023): `decisions.decided_by`와 `answers.asked_by`는 `references auth.users on delete set null`. `decisions.decided_by_name`은 `not null` 스냅샷. `members.user_id`는 `on delete cascade`.

**정정 경로**: `decisions.supersedes_id uuid references decisions`. 결정은 생성만 한다 — update·delete 경로를 스키마 차원에서 권장하지 않는다.

### 반드시 빠져야 하는 것

- **`items.embedding` 컬럼과 `items.embed_model` 컬럼을 넣지 마라.** 이유: ADR-018 — 임베딩 모델이 D2에 확정되지 않았고, 차원 `N`을 지금 박으면 "미정"이 거짓이 된다. 별도 task(`0b-embedding`)의 마이그레이션으로 추가한다. `items.embed_status text not null default 'pending'`은 **넣는다** (PRD §6-1에 있다).
- `pgvector` 확장 활성화(`create extension vector`)도 이 step이 아니다. 같은 이유.
- `decision_metrics` 뷰를 만들지 마라. 이유: PRD §8-0에서 제외됐다. 리드타임은 `decisions.lead_time_min` 컬럼에 insert 시 계산해 넣는다.

### 상태값 주석

`status`·`label`·`kind` 계열 컬럼에는 PRD §6-1의 주석(허용값 목록)을 SQL 주석으로 그대로 남겨라. 나중 step이 이 목록을 읽고 코드 상수를 만든다. `check` 제약을 걸지 말지는 재량에 맡기되, 걸었다면 §6-12 상태 전이표의 모든 값을 빠짐없이 포함해야 한다 — 값 하나가 빠지면 런타임에 insert가 막힌다.

### 확장

`create extension if not exists pgcrypto;`를 파일 맨 위에 둔다 (`gen_random_uuid()`용). Supabase는 보통 이미 켜져 있지만 명시한다.

## Acceptance Criteria

DB가 아직 없으므로 이 step은 파일 수준으로 검증한다. 실제 적용은 step 14다.

```bash
npm run lint && npm run build && npm test
```

```bash
F=supabase/migrations/0001_schema_v1.sql
test -f $F || { echo "FAIL: 마이그레이션 파일 없음"; exit 1; }
for t in orgs departments members sources meetings items ingest_events classifications \
         decision_requests decisions citations conflicts answers jobs llm_calls; do
  grep -qE "create table( if not exists)? +$t\b" $F || { echo "FAIL: 테이블 $t 없음"; exit 1; }
done
grep -q "unique (source_id, external_ref)" $F || { echo "FAIL: items 멱등 제약 없음"; exit 1; }
grep -q "one_open_request_per_item" $F        || { echo "FAIL: open 카드 partial unique 없음"; exit 1; }
grep -q "jobs_claim" $F                        || { echo "FAIL: jobs_claim 인덱스 없음"; exit 1; }
grep -q "supersedes_id" $F                     || { echo "FAIL: supersedes_id 없음"; exit 1; }
grep -q "is_demo" $F                           || { echo "FAIL: orgs.is_demo 없음"; exit 1; }
grep -qi "vector(" $F && { echo "FAIL: 임베딩 컬럼이 들어갔다 (ADR-018 위반)"; exit 1; }
echo "OK: 스키마 v1"
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - PRD §6-1의 컬럼이 하나도 빠지지 않았는가? (컬럼은 공짜다 — `consent_version`·`author_ext_id`·`sync_cursor`·`excluded_count`·`verified`도 넣는다. PRD §8-0 "데이터" 행)
   - ARCHITECTURE §6 불변식 13의 멱등 장치 4개가 전부 있는가?
   - ADR-018을 지켰는가? (`vector` 타입이 파일에 없어야 한다)
3. `phases/0-vertical-slice/index.json`의 step 1을 업데이트한다:
   - 성공 → `"completed"` + `"summary"`에 만든 테이블 수와 파일 경로
   - 실패 → `"error"` + `"error_message"`
   - 사용자 개입 필요 → `"blocked"` + `"blocked_reason"`

## 금지사항

- **`npx supabase db push`를 실행하지 마라.** 이유: Supabase 프로젝트 연결·DB 비밀번호가 필요한 사람 작업이고, 여기서 blocked가 나면 뒤의 코드 step 12개가 전부 멈춘다. 적용은 step 14에서 한다.
- Supabase 대시보드에서 스키마를 직접 만들지 마라. 이유: setup-guide §13 — 마이그레이션만이 진실이다.
- 임베딩 컬럼·`create extension vector`를 넣지 마라. 이유: ADR-018.
- RLS 활성화·정책·`can_see()`를 이 파일에 넣지 마라. 이유: step 2의 범위다. 한 step은 한 레이어만 다룬다.
- 기존 테스트를 깨뜨리지 마라.
