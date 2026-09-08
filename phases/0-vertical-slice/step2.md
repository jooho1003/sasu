# Step 2: rls-can-see

## 읽어야 할 파일

- `/docs/PRD.md` **§6-1 "RLS 원칙"** 4개 항목 — 이 step의 명세다
- `/docs/PRD.md` **§6-9 권한 모델** — 역할표(anon·member·lead·service role)가 정책의 원천이다
- `/docs/ARCHITECTURE.md` **§3.4 권한은 SQL에서 판정한다** · **§6 불변식 1·2·10·12**
- `/docs/ADR.md` **ADR-008**(pgvector + RLS) · **ADR-014**(가시성 2단계) · **ADR-024**(`can_see()` 단일 판정)
- `/docs/setup-guide.md` **§10 D8 코드 리뷰 1번** — 사람이 이 파일을 직접 읽는다. 그 체크리스트를 미리 통과하게 써라
- 이전 step 산출물: `supabase/migrations/0001_schema_v1.sql` (step 1) — 테이블·컬럼 이름의 원천

## 작업

`supabase/migrations/0002_can_see_rls.sql` 하나를 만든다.

### 1. `can_see()` — 가시성 판정의 유일한 지점

```sql
create or replace function can_see(p_user uuid, p_dept uuid, p_visibility text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ ... $$;
```

판정 규칙:
- `p_user`가 `p_dept`의 멤버가 아니면 false
- `p_visibility = 'leads_only'`이면 그 멤버의 `role = 'lead'`일 때만 true
- 그 외(`'dept'`)는 멤버이기만 하면 true

`security definer`가 필요한 이유: 이 함수는 `members`를 읽는데, `members`에도 RLS가 걸려 있어 invoker 권한이면 정책 평가가 자기 자신을 다시 부른다. `set search_path`를 빼지 마라 — security definer 함수의 search_path 하이재킹은 실제 권한 상승 경로다.

**판정 로직을 애플리케이션 코드에 복제하지 마라.** RLS 정책도, 나중에 만들 `search_as()`도 전부 이 함수를 부른다 (ARCHITECTURE §6 불변식 1).

### 2. RLS 활성화와 정책

**모든 테이블에 `enable row level security`를 건다.** 빠뜨린 테이블 하나가 전체를 무의미하게 만든다.

| 그룹 | 테이블 | 정책 |
|---|---|---|
| dept_id 보유 | `departments` · `members` · `sources` · `items` · `classifications` · `meetings` · `decision_requests` · `decisions` · `answers` | `dept_id`가 `auth.uid()`의 멤버십 안에 있을 것. `sources`·`items`·`decision_requests`처럼 `visibility`가 걸린 것은 `can_see(auth.uid(), dept_id, visibility)` |
| 소유 객체 join | `citations` · `conflicts` | 직접 `dept_id`가 없다. 소유 객체(`items`·`decisions`·`decision_requests`)를 join해 그쪽 정책 결과로 판정 |
| 사용자 접근 없음 | `jobs` · `ingest_events` · `llm_calls` · `orgs` | 정책을 만들지 않는다(= 전부 차단). service role만 접근 |

**모든 정책에 `using`과 `with check`를 둘 다 건다.** 읽기만 막고 쓰기를 열어두는 것이 가장 흔한 실수이고, D8 사람 리뷰의 1번 항목이다. select 전용 정책이라 `with check`가 문법상 불가한 경우를 제외하면, `for all`·`for insert`·`for update` 정책에는 예외 없이 둘 다 있어야 한다.

`items`의 visibility는 컬럼이 아니라 **`sources.visibility`**에 있다 (PRD §6-1). `items` 정책은 `sources`를 join해 판정한다. 같은 이유로 `decision_requests`는 자기 `visibility` 컬럼을 쓴다 — 카드는 생성 시 인용 소스 중 가장 좁은 것을 상속받아 저장한다(step 12).

### 3. 게스트(anon) 정책

`orgs.is_demo = true`인 org에 속한 부서의 데이터만 `anon` 롤에 **읽기 전용**으로 연다. 대상은 게스트 동선에 필요한 것만: `departments` · `sources` · `items` · `classifications` · `meetings` · `decision_requests` · `decisions` · `citations` · `conflicts` · `answers`.

- 쓰기 정책을 anon에 만들지 마라.
- 판별은 **`orgs.is_demo` 플래그**다. 조직 이름 문자열로 판별하지 마라 (ARCHITECTURE §6 불변식 10).
- `members`는 anon에 열지 마라 — 실명이 들어 있다.

### 4. 이 step에서 만들지 않는 것

**`search_as()`를 만들지 마라.** 시그니처가 `search_as(p_user, p_dept, p_query_embedding, k)`인데 임베딩 차원이 D2에 확정된다(ADR-018). 별도 task(`0b-embedding`)에서 `can_see()`를 호출하는 형태로 추가한다. 지금 자리표시자를 만들면 차원이 박힌다.

## Acceptance Criteria

DB가 없으므로 파일 수준 검증이다. 실제 RLS 동작 검증(서로 다른 JWT 3개)은 step 14다.

```bash
npm run lint && npm run build && npm test
```

```bash
F=supabase/migrations/0002_can_see_rls.sql
test -f $F || { echo "FAIL: 파일 없음"; exit 1; }
grep -q "create or replace function can_see" $F || { echo "FAIL: can_see 없음"; exit 1; }
grep -q "security definer" $F                    || { echo "FAIL: security definer 없음"; exit 1; }
grep -q "set search_path" $F                     || { echo "FAIL: search_path 고정 없음"; exit 1; }
grep -qi "search_as" $F && { echo "FAIL: search_as는 이 step이 아니다 (ADR-018)"; exit 1; }

# 모든 테이블에 RLS 활성화
for t in orgs departments members sources meetings items ingest_events classifications \
         decision_requests decisions citations conflicts answers jobs llm_calls; do
  grep -qE "alter table +$t +enable row level security" $F || { echo "FAIL: $t RLS 미활성"; exit 1; }
done

# using 과 with check 개수 비교 — select 전용 정책 수만큼만 차이가 나야 한다
U=$(grep -c "using (" $F); W=$(grep -c "with check (" $F); S=$(grep -ci "for select" $F)
echo "using=$U with_check=$W for_select=$S"
test $((U - W)) -le $S || { echo "FAIL: with check 없는 쓰기 정책이 있다"; exit 1; }
echo "OK: RLS 정책"
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트 — **D8 사람 리뷰(setup-guide §10)의 1번 항목을 미리 통과시켜라**:
   - 모든 정책에 `using`과 `with check`가 둘 다 있는가?
   - `can_see()` 외에 가시성 판정 로직이 SQL 어디에도 중복되지 않았는가?
   - `jobs`·`ingest_events`·`llm_calls`·`orgs`에 사용자 정책이 **없는가**? (있으면 유출이다)
   - anon 정책이 `orgs.is_demo`로만 판별하고 쓰기가 없는가?
   - `members`가 anon에 열려 있지 않은가?
3. `phases/0-vertical-slice/index.json`의 step 2를 업데이트한다:
   - 성공 → `"completed"` + `"summary"`에 `can_see()` 시그니처와 정책을 건 테이블 수
   - 실패 → `"error"` + `"error_message"`
   - 사용자 개입 필요 → `"blocked"` + `"blocked_reason"`

## 금지사항

- 가시성 판정을 TypeScript로 복제하지 마라. 이유: 두 곳에 있으면 반드시 어긋나고, 어긋나는 쪽이 유출이다 (ADR-024).
- `with check` 없는 `for insert`/`for update`/`for all` 정책을 만들지 마라. 이유: 읽기만 막고 쓰기를 열어두면 member가 `leads_only` 카드를 만들 수 있다.
- `security definer` 함수에서 `set search_path`를 빼지 마라. 이유: 권한 상승 경로다.
- `search_as()`나 `create extension vector`를 넣지 마라. 이유: ADR-018 — 임베딩 확정 전이다.
- `npx supabase db push`를 실행하지 마라. 이유: step 14의 범위이고, 여기서 막히면 뒤 step 전부가 멈춘다.
- 기존 테스트를 깨뜨리지 마라.
