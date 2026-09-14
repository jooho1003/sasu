# Step 0: agent-roles-schema

## 읽어야 할 파일

- `/docs/ADR.md` **ADR-038** 전체 (이 phase의 설계 근거), ADR-013·ADR-021·ADR-024
- `/docs/PRD.md` §6-1 데이터 모델 중 `agent_roles`·`agent_role_results` 블록, §6-9 권한 모델, §11 "부서 역할" 행
- `/docs/ARCHITECTURE.md` §3.4 권한은 SQL에서 판정 · §3.7 파생물은 가장 좁은 visibility · §5 상태표의 `agent_role_results` 행 · §6 불변식
- `supabase/migrations/0002_can_see_rls.sql` (`can_see`, `is_demo_department`)
- `supabase/migrations/0011_document_assistant.sql` (문서 소스·요약 RLS 패턴)
- `supabase/migrations/0017_card_decision_boundaries.sql` (`promote_item`·`record_direct_decision`: auth.uid() 기반 SECURITY DEFINER 쓰기 RPC 패턴)
- `supabase/migrations/0020_remove_source.sql` (lead 판정·데모 거부 패턴), `0021_ask_daily_limit.sql` (일일 상한 패턴)
- `scripts/verify-security-sql.mjs` (PGlite 보안 SQL 검증. 기존 케이스 구성 방식을 그대로 따른다)

## 작업

`supabase/migrations/0023_agent_roles.sql`을 만든다.

### 1. 테이블

PRD §6-1 정의를 그대로 따르고 아래 제약을 추가한다.

- `agent_roles`
  - check: `char_length(name) between 1 and 60`, `char_length(instruction) between 1 and 2000`
  - check: `jsonb_typeof(criteria) = 'array' and jsonb_array_length(criteria) between 1 and 10`
  - check: `visibility in ('dept','leads_only')`
  - 인덱스: `(dept_id) where archived_at is null`
- `agent_role_results`
  - check: `status in ('processing','completed','failed')`, `visibility in ('dept','leads_only')`, `weighted_score is null or weighted_score between 0 and 5`
  - `unique (role_id, source_id)`
  - 인덱스: `(role_id, weighted_score desc nulls last)`

### 2. RLS

두 테이블 모두 `enable row level security`로 켠다.

- `agent_roles`
  - SELECT (authenticated): `can_see(auth.uid(), dept_id, visibility)`
  - INSERT (authenticated): WITH CHECK `can_see(auth.uid(), dept_id, 'leads_only') and created_by = auth.uid() and archived_at is null and not is_demo_department(dept_id)`
  - UPDATE (authenticated): USING과 WITH CHECK 모두 `can_see(auth.uid(), dept_id, 'leads_only') and not is_demo_department(dept_id)`
  - `archived_at` 외의 컬럼 변경은 BEFORE UPDATE 트리거로 거부한다. 이미 보관된 역할의 `archived_at`을 되돌리는 것도 거부한다.
  - DELETE 정책은 만들지 않는다.
- `agent_role_results`
  - SELECT (authenticated): 아래 두 조건을 모두 만족할 때만 허용한다.
    - `can_see(auth.uid(), dept_id, visibility)`
    - `exists (select 1 from sources s where s.id = source_id and s.dept_id = agent_role_results.dept_id and can_see(auth.uid(), s.dept_id, s.visibility))`
  - authenticated용 INSERT·UPDATE·DELETE 정책은 **만들지 않는다**. 쓰기는 아래 RPC와 service role(워커)만 한다.

### 3. RPC `public.request_agent_role_run(p_role uuid, p_sources uuid[])`

- 반환: `table(result_id uuid, source_id uuid, updated_at timestamptz)`
- `language plpgsql security definer set search_path = public, pg_temp`
- `auth.uid()`가 null이면 예외 `not_authenticated`.
- 역할이 없거나, `archived_at`이 있거나, 호출자가 그 부서 lead가 아니거나(`can_see(auth.uid(), role.dept_id, 'leads_only')`가 false), 데모 부서면 예외 `agent_role_forbidden`.
- `p_sources`가 null, 비어 있음, 20개 초과, 중복 포함 중 하나면 예외 `agent_role_sources_invalid`.
- 소스마다 아래 조건을 **하나라도** 어기면 전체 예외 `agent_role_sources_invalid` (부분 성공 없음).
  - `dept_id`가 역할과 같다
  - `kind = 'document'`
  - `active`가 참이다 (0020의 소스 활성 의미를 따른다)
  - `can_see(auth.uid(), dept_id, visibility)`
  - `document_summaries` 행이 있다
- 일일 상한: 같은 부서에서 오늘(`Asia/Seoul` 날짜) `updated_at`이 갱신된 결과 행 수와 이번 요청 수의 합이 100을 넘으면 예외 `agent_role_daily_limit`. 방식은 0021 패턴을 따른다.
- 각 소스를 `insert ... on conflict (role_id, source_id) do update`로 기록한다.
  - `visibility`: 역할과 소스 중 하나라도 `leads_only`면 `leads_only`, 둘 다 아니면 `dept`
  - `status='processing'`, `status_reason=null`, `result=null`, `weighted_score=null`
  - `requested_by=auth.uid()`, `updated_at=clock_timestamp()` (한 호출 안에서도 행마다 달라지게)
- 권한: `revoke all ... from public; grant execute ... to authenticated;`

### 4. 보안 SQL 검증

`scripts/verify-security-sql.mjs`에 케이스를 추가한다. 기존 lead·member·dept·source 픽스처 방식을 재사용한다.

1. member가 `agent_roles` insert → 거부
2. lead insert에서 `created_by`를 다른 uuid로 → 거부
3. lead 정상 insert → 성공
4. `leads_only` 역할을 member가 select → 0행. `dept` 역할은 1행
5. lead가 `agent_roles.name` update → 트리거 거부. `archived_at` 설정 → 성공
6. member가 `request_agent_role_run` 호출 → `agent_role_forbidden`
7. lead가 다른 부서 소스·`kind<>'document'` 소스·21개 소스를 넘김 → `agent_role_sources_invalid`
8. lead 정상 호출 → 결과 행 생성, visibility가 좁은 쪽인지 확인. 같은 호출 재실행 → 행 수 그대로, `updated_at` 증가
9. member가 `agent_role_results`에 직접 insert·update → 거부. `leads_only` 결과 select → 0행
10. 보관된 역할로 호출 → `agent_role_forbidden`
11. 데모 부서 역할로 호출 → `agent_role_forbidden`

## Acceptance Criteria

```bash
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"   # 기존 + 신규 케이스 전부 통과
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

## 검증 절차

1. AC 커맨드를 실행한다.
2. 체크리스트: `can_see` 외의 권한 판정 로직을 새로 만들지 않았는가 · RLS에 USING과 WITH CHECK가 모두 있는가 · RPC가 요청 본문의 dept를 받지 않고 역할에서 dept를 도출하는가.
3. `phases/4-agent-roles/index.json`의 step 0을 갱신한다 (summary에 테이블·RPC 이름과 추가된 검증 케이스 수).

## 금지사항

- 운영 Supabase에 `db push` 하지 마라. 이유: 운영 반영은 사용자 승인 노드(O1)다.
- authenticated에 `agent_role_results` INSERT·UPDATE 정책을 열지 마라. 이유: 점수·상태를 사용자가 위조할 수 있다.
- lead 판정을 `members.role` 직접 조회로 새로 쓰지 마라. 반드시 `can_see(..., 'leads_only')`를 쓴다. 이유: 판정 로직이 두 곳이 되면 어긋난다 (CLAUDE.md CRITICAL).
- 기존 마이그레이션 파일을 수정하지 마라. 이유: 운영 DB에 이미 적용됐다.
