# Step 4: roots-discover

수집 범위(`notion_roots`)와 자동 발견 job을 만든다. 화면은 step 7이고 여기서는 RPC·job·테스트까지다.

## 읽어야 할 파일

- `/docs/PRD.md` §3-5(NOT-03·07), §8 ADR-060 경계(부서 단위 동의 게이트·미배정 미수집·조직 관리자 열람 경계·페이지 상한)
- `/docs/ADR.md` ADR-060, ADR-044
- `/docs/planning/노션_전체수집_설계.md` §0, §4, §5-1, §7, §9
- `supabase/migrations/0026_org_admin.sql`(`org_admins`, `admin_org_id()`, `is_org_admin()`), `0037_review_access_controls.sql`(`org_settings`), step 2·3의 migration
- `lib/jobs.ts`(job kind 등록·`enqueue`·dedupe·실패 소유자 매핑), `lib/worker.ts`, `lib/pipeline/notion-import.ts`(step 3의 `children` 반환), `lib/pipeline/slack-backfill.ts`(커서 체크포인트 선례)
- `lib/contracts.ts`(job kind·payload 스키마가 여기 있으면 여기에 추가)

## 작업

1. migration:
   - `notion_roots(id, org_id, dept_id, scope check in ('workspace','subtree'), notion_id text null, notion_kind check in ('page','database') null, top_title text null(마스킹된 최상위 제목), visibility check in ('dept','leads_only') default 'dept', include_new boolean default true, card_candidates boolean default false, created_by, created_role check in ('org_admin','lead'), state check in ('pending','discovering','idle','paused_consent','paused_limit','failed','disabled'), discover_cursor jsonb, last_discovered_at, last_error, created_at)`. `(dept_id, notion_id)` 활성 유니크, 조직당 `workspace` scope는 부서당 1개. `(dept_id, org_id)` 복합 FK로 부서-조직 일치를 강제.
   - `notion_exclusions(dept_id, notion_id, subtree boolean, created_by, created_at)` PK `(dept_id, notion_id)`.
   - `sources.root_id` FK 연결. `org_settings.notion_page_limit integer not null default 2000`.
   - RLS: 두 테이블 모두 직접 쓰기 금지. 읽기는 부서장(`can_see(auth.uid(), dept_id, 'leads_only')`)만. 조직 관리자는 RPC로만.
   - RPC:
     - `admin_upsert_notion_root(p_dept, p_scope, p_notion_id, p_kind, p_top_title, p_visibility, p_include_new)` — 조직 관리자. 부서가 `admin_org_id()` 조직 소속인지, 설치가 active인지, **그 부서에 `members.consented_at is null`이 0명인지** 검사. 미동의가 있으면 `consent_required` 예외(인원 수만 포함, 이름 없음).
     - `lead_upsert_notion_root(p_dept, p_notion_id, p_kind, p_visibility)` — 부서장. scope는 `subtree` 고정. 같은 동의 검사.
     - `admin_notion_roots()` — 조직 관리자용 목록: root id·부서 이름·`top_title`·scope·state·카운트(발견/완료/대기/실패/제외/빈 페이지)·미배정 수. **하위 페이지 제목·id·오류 본문을 넣지 않는다.**
     - `set_notion_exclusion(p_dept, p_notion_id, p_subtree, p_excluded)` — 부서장. 제외 시 해당 소스(와 subtree면 `parent_external_id` 사슬로 찾은 후손)를 `retire`와 같은 방식으로 비활성·소프트 삭제.
     - `register_notion_page(p_root, p_page, p_parent, p_remote_edited_at, p_title)` — service_role. 한 트랜잭션에서: root가 `discovering|idle`인지, 동의 게이트(미동의 발생 시 root를 `paused_consent`로 바꾸고 false), 제외(자기 또는 조상), 조직 페이지 상한(초과 시 `paused_limit`), 더 가까운 다른 root의 존재, 기존 활성 소스(있으면 `root_id`만 연결)를 검사 → 없으면 `sources` 행 생성(`import_version=2`, `ingest_mode` = root의 `card_candidates`에 따라, `visibility` = root 값, `auto_sync=false`) + `notion_import` job 예약. 반환: `created|linked|excluded|limit|paused`.
     - `save_discover_cursor(p_root, p_lease, p_cursor, p_done)` — 커서 저장과 상태 전이.
2. `lib/pipeline/notion-discover.ts`(테스트 먼저 `tests/pipeline/notion-discover.test.ts`): job kind `notion_discover`, payload `{rootId}`.
   - subtree(page): 루트 페이지를 `register` → 그 페이지의 `children`을 큐에 넣고 BFS. 자식의 자식은 **각 페이지의 `notion_import`가 끝날 때** 그 `children`을 `register_notion_page`로 등록해 이어 간다(발견 job이 본문을 두 번 읽지 않게). database: `listDataSources` → `queryDataSource` 페이지네이션으로 행 등록. 링크된 데이터베이스 보기처럼 조회가 `notion_not_found`·`notion_api_failed`·`notion_database_unsupported`로 끝나는 `child_database`는 root를 실패시키지 말고 그 항목만 `지원하지 않는 데이터베이스`로 집계하고 넘어간다. `searchNotion` 결과의 `object`가 `data_source`인 항목은 페이지로 등록하지 않는다. workspace: `searchNotion`으로 접근 가능한 전체를 등록(부모가 다른 subtree root에 속하면 그쪽이 이긴다).
   - 1회 실행 40초 상한. 넘으면 `{queue 위치, api cursor}`를 `save_discover_cursor`로 저장하고 같은 job kind를 다시 예약한다. 재실행은 커서에서 이어 간다. 같은 root의 동시 실행은 lease로 1개.
   - 429는 `retryAfterSeconds`를 실은 오류를 그대로 던져 jobs의 재시도에 맡긴다(커서는 저장한 뒤).
   - 실패 소유자 매핑: 최종 실패 → `notion_roots.state='failed', last_error`.
3. `importNotionSource`가 끝나면 소스에 `root_id`가 있을 때 `children`을 `register_notion_page`로 등록한다. `include_new=false`인 root는 최초 발견이 끝난 뒤(`idle`) 새 자식을 등록하지 않는다.
4. 직접 등록 라우트에 `하위 페이지 포함` 옵션: true면 `lead_upsert_notion_root` + `notion_discover` 예약.
5. 미배정 수: workspace root가 없는 조직에서 `searchNotion` 결과 중 어느 root에도 속하지 않는 페이지 수. **본문·제목을 저장하지 않고 개수만** `notion_installations.unassigned_count`(컬럼 추가)에 기록한다.

## 코드 관계와 구조 확인

발견 흐름(관리자 RPC → `notion_discover` → `register_notion_page` → `notion_import` → children 재등록)을 구조도로 남긴다. 사람이 결정하는 지점(범위 매핑·제외·상한 상향)과 멈춤 상태(`paused_consent`·`paused_limit`)를 표시한다. 경로: `docs/verification/notion-collection/step4.md`.

## Acceptance Criteria

```bash
npx vitest run tests/pipeline/notion-discover.test.ts tests/pipeline/notion-import.test.ts
npm run lint && npm run build && npm run test
```

로컬 Supabase + 노션 mock으로 실행 기록:
- 3단계 트리(페이지 12개 + DB 1개에 행 30개) → 소스 43행, 중복 0. 발견 job을 중간에 강제 종료한 뒤 재실행해도 결과 동일.
- root 밖 페이지는 소스·item 0건, `unassigned_count`만 증가.
- 제외한 subtree는 재발견 후에도 소스가 생기지 않는다.
- 상한 5로 낮추면 5건에서 `paused_limit`, 이후 등록 0건.
- 부서에 미동의 멤버 1명 추가 → root 생성 RPC `consent_required`, 진행 중이던 root는 다음 등록에서 `paused_consent`. 동의 후 재개 가능.
- 다른 조직 관리자가 남의 부서로 root 생성 → 42501. 일반 멤버의 `lead_upsert_notion_root` → 42501.
- `admin_notion_roots()` 결과 JSON에 하위 페이지 제목 문자열이 없다(테스트에서 문자열 검색으로 확인).

## 검증 절차

AC → CRITICAL 점검 → `index.json` step 4 갱신.

## 금지사항

- 부서가 정해지지 않은 페이지의 본문을 읽거나 저장하지 마라. 이유: PRD §8 ADR-060 경계 — 열람 범위가 정해지기 전의 수집은 유출 경로다.
- 동의 검사를 TS에서만 하지 마라. 이유: 판정이 두 곳이면 어긋난다. SQL RPC 안에서 한다.
- 조직 관리자에게 하위 제목·본문·오류 상세를 반환하지 마라. 이유: ADR-044.
- 발견 job 하나가 트리 전체의 본문을 직접 읽지 마라. 이유: 페이지마다 두 번 읽게 되고 40초 상한을 넘는다.
- 운영 DB 적용·커밋 금지.
