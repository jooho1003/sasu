# Step 0: trailer-schema

## 읽어야 할 파일

- `/docs/PRD.md` §3-2 (phase `11-trailer-publish` 행) · §11 "예고편 발행 (ADR-045)" 행
- `/docs/ARCHITECTURE.md` §6-1 · §6-2 불변식 19·20·22 · 상태 추가(`trailers`)
- `/docs/ADR.md` ADR-045 1·2항 · ADR-040·041(합성 체험 경계)
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §C-2 데이터 · §C-3 발행 흐름(mermaid·검사 우회 방지) · §L2 데이터 흐름 표·고칠 것 1·2·6 · §L3 · §L4 6~9 · §L5 1·2·6 · §R R-1·R-4·R-8
- `lib/contracts.ts` 155~187행 `TrailerScenario`·`TrailerSubmission` (시나리오 jsonb의 모양)
- `supabase/migrations/0026_org_admin.sql` (`private` 스키마, `departments (id, org_id)` 제약, 함수 권한 패턴), `0021_ask_daily_limit.sql`(기존 상한 — 이번에는 **카운터 upsert**로 대체), `0017_card_decision_boundaries.sql`(decisions `visibility`), `0001_schema_v1.sql`(decisions `supersedes_id`·`request_id`, decision_requests `title`)
- `scripts/verify-security-sql.mjs` (step 0026에서 추가된 `asUserWithEmail`, 기본 함수 권한 재현, 맨 끝 롤백 블록)

## 작업

`supabase/migrations/0027_trailer_publish.sql`의 테이블·트리거·부서장/워커 RPC를 만든다. 발행·공개 조회·관리자 RPC는 step 1이 같은 파일에 추가한다. 공통 규칙은 0026과 같다(definer + `search_path = public, pg_temp` + 4역할 revoke 후 최소 grant, pgcrypto 금지).

### 1. 테이블

- `orgs.trailer_publish_enabled boolean not null default false`
- `trailers`: 설계 §C-2 정의에 아래를 더한다.
  - `scenarios_hash text` — 트리거만 쓴다
  - `slug`는 `check (slug ~ '^[a-z0-9]{22}$')`. 이유: phase 9 `lib/site.ts`의 `trailerDemoHref()`가 `/t/[a-z0-9-]+`만 받는다.
  - `apply_url`은 `check (apply_url is null or (apply_url ~ '^https://' and char_length(apply_url) <= 2000))`
  - `check (cardinality(source_decision_ids) between 1 and 3)`, `check (cardinality(banned_terms) <= 50)`, `rubric` 배열 길이 1~6
  - `(dept_id, org_id)` 복합 FK → `departments (id, org_id)`
- `trailer_generation_counters (dept_id, kst_date, count)` — 설계 §C-2
- RLS: `trailers` SELECT to authenticated `using (can_see(auth.uid(), dept_id, 'leads_only'))` · SELECT to anon `using (is_demo_department(dept_id))`(0024 패턴, `grant select … to anon`) · authenticated·anon의 INSERT·UPDATE·DELETE 권한 회수. 카운터는 RLS on, 정책 없음, anon·authenticated 권한 없음.

### 2. 트리거 (쓰기 주체와 무관하게 집행)

- BEFORE INSERT: `org_id`를 `departments`에서 채운다(요청값 무시).
- BEFORE UPDATE: `org_id`·`dept_id`·`source_decision_ids`·`created_by` 변경 거부.
- BEFORE INSERT OR UPDATE: `scenarios`가 새로 들어오거나 바뀌면(`is distinct from`) `scenarios_hash := encode(sha256(convert_to(new.scenarios::text,'UTF8')),'hex')`(null이면 null), `gate_passed_hash`·`approval_hash`·`approved_by`·`approved_at` null, `approved_item_ids` 빈 배열. `updated_at := clock_timestamp()`는 모든 UPDATE에서.
- 해시는 **이 트리거 한 곳**에서만 계산한다. TS·다른 함수에서 해시를 계산하지 않는다(설계 §L2 고칠 것 1).

### 3. 승인 항목 id

- `private.trailer_approval_item_ids(p_scenarios jsonb) returns text[]` — 시나리오마다 `<id>:title`, `<id>:summary`, `<id>:fact:<fact.id>`, `<id>:dialogue:<dialogue.id>`, `<id>:choice:<choice.id>`, `<id>:ending`. 순서: 시나리오 순 → 위 나열 순 → 배열 순.
- 골든 픽스처 `tests/fixtures/trailer-approval.json` = `{ "scenarios": [...], "expected_item_ids": [...] }`(시나리오 2개짜리 합성 데이터, `lib/contracts.ts` 계약을 만족). 하니스가 파일을 읽어 SQL 결과와 비교한다. step 2의 TS 함수도 같은 파일로 테스트한다.

### 4. RPC

| RPC | grant | 규칙 | 오류 |
|---|---|---|---|
| `trailer_candidates(p_dept uuid) returns jsonb` | authenticated | 부서장만. 그 부서 `decisions` 중 `visibility='dept'`이고 **정정되지 않은**(`supersedes_id`로 가리키는 행이 없는) 결정 `[{decision_id, decided_at, outcome, card_title}]`, 최신순 50개 | `forbidden` |
| `create_trailer_draft(p_dept uuid, p_decision_ids uuid[], p_banned_terms text[], p_apply_url text, p_rubric jsonb) returns table(trailer_id uuid, updated_at timestamptz)` | authenticated | 부서장·비데모. 결정 1~3개·중복 없음·전부 위 후보 규칙 충족. 금지어 `btrim` 1~60자·최대 50. `apply_url` https만. 기준표 1~6개(`key`·`label`·`description`·`weight 1~5`). 카운터 `insert … on conflict do update set count = count + 1 returning count` → 20 초과면 예외(트랜잭션째 롤백). `status='generating'` | `forbidden` · `trailer_decisions_invalid` · `invalid_banned_terms` · `invalid_apply_url` · `invalid_rubric` · `trailer_daily_limit` |
| `regenerate_trailer(p_trailer uuid)` 반환 위와 같음 | authenticated | 부서장. `failed`에서만 → `generating`, 카운터 +1 | `forbidden` · `trailer_state_invalid` · `trailer_daily_limit` |
| `update_trailer_scenarios(p_trailer uuid, p_scenarios jsonb, p_seen_updated_at timestamptz)` 반환 위와 같음 | authenticated | 부서장. `review`·`unpublished`에서만. `updated_at ≠ p_seen_updated_at`이면 거부. jsonb 배열 1~3개 확인(세부 계약은 라우트의 `validateScenario`와 워커가 다시 검증). `status='checking'` | `forbidden` · `trailer_state_invalid` · `trailer_stale` · `invalid_scenarios` |
| `request_trailer_recheck(p_trailer uuid)` 반환 위와 같음 | authenticated | 부서장. `review` → `checking` | `forbidden` · `trailer_state_invalid` |
| `record_trailer_gate(p_trailer uuid, p_report jsonb, p_passed boolean, p_seen_updated_at timestamptz) returns text` | **service_role만** | 본문 첫 줄에서도 `auth.role() = 'service_role'` 확인. `checking`이 아니거나 `updated_at` 불일치면 아무것도 쓰지 않고 `'stale'`. 보고서는 `{passed, violations:[{path, rule}]}`만 허용(rule ∈ `overlap`·`proper_noun`·`mask`·`schema`, 다른 키 거부). `gate_passed_hash := case when p_passed then scenarios_hash end`, `status='review'`, `'recorded'` | `forbidden` · `invalid_gate_report` |
| `approve_trailer_items(p_trailer uuid, p_item_ids text[]) returns jsonb` | authenticated | 부서장. `review`에서만. 유효 id만 저장. 저장 id ⊇ `private.trailer_approval_item_ids(scenarios)`면 `approval_hash := scenarios_hash`, `approved_by/at` 기록, 아니면 null. `{approved_count, total_count, complete}` | `forbidden` · `trailer_state_invalid` |
| `delete_trailer(p_trailer uuid)` | authenticated | 부서장. `review`·`failed`·`unpublished`만 하드 삭제 | `forbidden` · `trailer_state_invalid` |

- 워커의 시나리오 저장·실패 기록은 RPC 없이 service role 직접 update로 한다(step 2). 트리거가 해시를 관리하므로 안전하다.
- 생성 입력 경계(원시 발언·카드 `background`·인용 quote 제외)는 워커(step 2)의 책임이지만, `trailer_candidates`가 `outcome`과 카드 `title` 외의 텍스트를 반환하지 않게 한다.

### 5. 롤백 SQL

`supabase/rollback/0027_trailer_publish_down.sql` — 이 step의 함수·트리거·테이블·`orgs` 컬럼 제거. 하니스 맨 끝 롤백 블록에서 **0026 down보다 먼저** 적용되게 추가한다.

### 6. 하니스 케이스

1. authenticated(부서장 포함)가 `record_trailer_gate` 호출 → 42501. anon → 42501.
2. 부서장 정상 생성 → `generating` · member 생성 → `forbidden` · 다른 부서 결정 섞음 → `trailer_decisions_invalid` · `leads_only` 결정 → 같은 오류 · 정정된(대체된) 결정 → 같은 오류 · 데모 부서 → `forbidden` · `http://` 공고 → `invalid_apply_url`.
3. 하루 상한: 같은 부서 20회 생성 성공 → 21번째 `trailer_daily_limit` + `trailers` 행 수 20 그대로(카운터 원자 upsert, 롤백 확인).
4. service_role이 시나리오 저장 → `scenarios_hash` 채워짐 · `record_trailer_gate(passed=true)` → `gate_passed_hash = scenarios_hash`, `review` · `passed=false` → `gate_passed_hash` null.
5. `updated_at`이 다르면 `record_trailer_gate` → `'stale'`, 행 불변.
6. 전 항목 승인 → `approval_hash = scenarios_hash` · 하나 빼고 승인 → `approval_hash` null · 부서장 `update_trailer_scenarios` → 두 해시·승인 목록 초기화 · **service_role 직접 update**로 시나리오 변경 → 두 해시 초기화(트리거가 주체 무관).
7. 보고서에 `excerpt` 같은 추가 키 → `invalid_gate_report`.
8. member select → 0행 · 다른 부서 부서장 select → 0행 · anon은 데모 부서 행만.
9. `private.trailer_approval_item_ids`가 골든 픽스처 `expected_item_ids`와 같다.
10. 쓰기 경계 행렬 통과(두 테이블 모두 허용 목록 밖) · 신규 함수 권한 표(`record_trailer_gate`는 service_role만).

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
2. 체크리스트: 해시 계산이 트리거 한 곳뿐인가 · 검사 기록이 service_role 외에 열려 있지 않은가 · 부서장 판정이 `can_see(..., 'leads_only')`인가 · 상한이 count(*)가 아니라 카운터 upsert인가 · 0001~0026을 수정하지 않았는가.
3. `phases/11-trailer-publish/index.json` step 0을 갱신한다.

## 금지사항

- 운영 DB에 적용하지 마라. 이유: O11 승인 노드이고 0026이 먼저다.
- 발행·공개 조회·관리자 RPC를 이 step에서 만들지 마라. 이유: step 1 범위다.
- `lib/contracts.ts`·`lib/trailer.ts`·`components/recruitment-trailer.tsx`를 수정하지 마라. 이유: 이 step은 SQL만 한다.
- 원장·카드 원문 조각을 `gate_report`에 저장할 수 있는 경로를 만들지 마라. 이유: 설계 §C-3 — 결과는 `{path, rule}`만.
