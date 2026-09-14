# Step 0: assessment-schema

## 읽어야 할 파일

- `/docs/PRD.md` §3-2 (phase `12-trailer-assessment` 행) · §11 "합성 채점 (ADR-045)" 행
- `/docs/ARCHITECTURE.md` §6 불변식 12 · §6-2 불변식 19·21·22 · 상태 추가(`trailer_attempts`)
- `/docs/ADR.md` ADR-045 4항·법적 한계 · ADR-038(채용 사용 조건)
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §C-2 `trailer_attempts`·`orgs.trailer_assessment_enabled` · §C-4 · §L3 "채점 스크립트 재실행" · §L4 6 · §L5 3·5
- `supabase/migrations/0027_trailer_publish.sql`(트리거·RLS·함수 권한 패턴, `trailers` 상태), `0026_org_admin.sql`, `0024_agent_roles_demo_read.sql`
- `scripts/verify-security-sql.mjs` (0026·0027 케이스, 맨 끝 롤백 블록)

## 작업

`supabase/migrations/0028_trailer_assessment.sql`을 만든다. 공통 규칙은 0026·0027과 같다(definer + `search_path = public, pg_temp` + 4역할 revoke 후 최소 grant, pgcrypto 금지).

### 1. 스키마

- `orgs.trailer_assessment_enabled boolean not null default false` — 사용자 경로에서 바꿀 수 없다(`orgs`는 사용자 접근 없음). 바꾸는 RPC를 만들지 않는다.
- `trailer_attempts`: 설계 §C-2 정의에 더해
  - `label` `btrim` 1~40자, `submissions`는 jsonb 배열 1~3개, `weighted_score is null or between 0 and 5`
  - `trailer_id`는 `trailers(id) on delete cascade`
- 트리거(쓰기 주체와 무관하게 집행):
  - BEFORE INSERT: `dept_id`를 `trailers.dept_id`로 채운다(요청값 무시).
  - BEFORE INSERT OR UPDATE: `kind = 'candidate'`인데 예고편 조직의 `trailer_assessment_enabled`가 false면 `raise exception 'trailer_assessment_disabled'`. **service_role에도 적용**된다(ADR-045 4항 "RPC와 트리거 이중").
  - BEFORE UPDATE: `trailer_id`·`dept_id`·`kind`·`label`·`submissions` 변경 거부. `updated_at := clock_timestamp()`.
- RLS: SELECT to authenticated `using (can_see(auth.uid(), dept_id, 'leads_only'))` · SELECT to anon `using (is_demo_department(dept_id))`(`grant select … to anon`) · anon·authenticated의 INSERT·UPDATE·DELETE 회수.

### 2. RPC

| RPC | grant | 규칙 | 오류 |
|---|---|---|---|
| `create_trailer_attempt(p_attempt_id uuid, p_trailer uuid, p_kind text, p_label text, p_submissions jsonb) returns table(attempt_id uuid, updated_at timestamptz)` | **service_role만** | 본문에서도 `auth.role() = 'service_role'` 확인. 예고편에 시나리오가 있고 `review`·`published`·`unpublished`. `p_kind` ∈ `synthetic`·`candidate`; `candidate`면 조직 플래그 확인(트리거와 이중). `p_attempt_id`로 `insert … on conflict (id) do update set status='scoring', status_reason=null, result=null, weighted_score=null`(같은 id 재실행은 멱등, 제출물이 다르면 `attempt_submissions_mismatch`) | `forbidden` · `trailer_state_invalid` · `invalid_attempt` · `trailer_assessment_disabled` · `attempt_submissions_mismatch` |

- 부서장·게스트용 쓰기 RPC와 실제 지원자 초대·동의 RPC를 만들지 않는다(설계 §C-1 "만들지 않는다").

### 3. 롤백 SQL

`supabase/rollback/0028_trailer_assessment_down.sql` — 함수·트리거·테이블·`orgs` 컬럼 제거. 하니스 맨 끝 롤백 블록에서 **0027 down보다 먼저** 적용.

### 4. 하니스 케이스 (PRD §11 합성 채점 행의 SQL 부분)

1. 조직 플래그 off: service_role이 `kind='candidate'`를 **직접 insert** → `trailer_assessment_disabled`(트리거) · `create_trailer_attempt(..., 'candidate', ...)` → 같은 오류(RPC).
2. service_role로 조직 플래그를 켠 뒤 candidate 생성 → 성공 · 다시 끄고 그 행의 `kind` 재저장 update → 거부.
3. authenticated(부서장 포함)·anon이 `create_trailer_attempt` → 42501.
4. synthetic 생성 → `dept_id`가 예고편 부서로 채워짐(요청값 무시) · 같은 `p_attempt_id` 재호출 → 행 수 그대로, `status='scoring'` · 제출물을 바꿔 재호출 → `attempt_submissions_mismatch`.
5. service_role의 `submissions` update → 거부 · `result`·`status` update → 허용.
6. member select → 0행 · 같은 부서 부서장 → 보임 · 다른 부서 부서장 → 0행 · anon → 데모 부서 행만.
7. 예고편 삭제 → attempt cascade 삭제.
8. 쓰기 경계 행렬 통과 · 신규 함수 권한 표(`create_trailer_attempt`는 service_role만) · 맨 끝 롤백 블록(0028 → 0027 → 0026 순) 통과.

## Acceptance Criteria

```bash
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"   # failed 0
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

## 검증 절차

1. AC를 실행한다.
2. 체크리스트: candidate 거부가 RPC와 트리거 두 곳에 있는가 · 조직 플래그를 바꾸는 경로가 SQL에 없는가 · 부서장 판정이 `can_see(..., 'leads_only')`인가 · 0001~0027을 수정하지 않았는가.
3. `phases/12-trailer-assessment/index.json` step 0을 갱신한다.

## 금지사항

- 운영 DB에 적용하지 마라. 이유: O12 승인 노드이고 0027이 먼저다.
- 실제 지원자 초대·동의·제출·보관 기한 테이블이나 RPC를 만들지 마라. 이유: 법률 자문 전 비활성(ADR-045 4항, 설계 §L5 5).
- 합격·불합격·추천·순위 컬럼을 만들지 마라. 이유: 불변식 21.
- 앱 코드를 수정하지 마라. 이유: step 1 이후 범위다.
