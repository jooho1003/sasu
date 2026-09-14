# Step 1: trailer-publish-sql

## 읽어야 할 파일

- `/docs/PRD.md` §11 "예고편 발행 (ADR-045)" 행 · §10 #25(파일럿 조직 공개 허용 off 권장)
- `/docs/ARCHITECTURE.md` §6-2 불변식 17·20
- `/docs/ADR.md` ADR-044 2항(관리자는 공개 허용·철회만) · ADR-045 2·3항
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §B-3 작업 표 마지막 행 · §B-6 `admin_overview`·`admin_unpublish_trailer`·`admin_set_trailer_publishing` · §C-3 공개 조회·표시 · §L2 고칠 것 7 · §L3 "발행 버튼 연타"·"철회 후 재발행" · §L4 7 · §L5 2
- step 0 산출물: `supabase/migrations/0027_trailer_publish.sql`, `supabase/rollback/0027_trailer_publish_down.sql`, 하니스 신규 케이스
- `supabase/migrations/0026_org_admin.sql` (`private._admin_overview`, `demo_admin_overview`, `admin_events` action 값)

## 작업

같은 `0027_trailer_publish.sql`에 발행·철회·공개 조회·조직 관리자 RPC를 추가한다. 공통 규칙은 step 0과 같다.

### 1. 발행·철회·공개 조회

| RPC | grant | 규칙 | 오류 |
|---|---|---|---|
| `publish_trailer(p_trailer uuid) returns text` | authenticated | 부서장·비데모. 이미 `published`면 같은 slug 반환(연타 멱등). `review`에서만 발행. **세 조건을 모두 SQL에서 확인**: ① `orgs.trailer_publish_enabled` ② `scenarios_hash = gate_passed_hash` ③ `scenarios_hash = approval_hash`. slug는 매번 새로 만든다: `substr(replace(gen_random_uuid()::text,'-','') \|\| replace(gen_random_uuid()::text,'-',''), 1, 22)`(unique 충돌 시 재시도). `published_at`, `status='published'` | `forbidden` · `trailer_state_invalid` · `trailer_publishing_disabled` · `trailer_gate_not_passed` · `trailer_not_approved` |
| `unpublish_trailer(p_trailer uuid)` | authenticated | 부서장. `published` → `unpublished`, `unpublished_at/by`, **`slug := null`**(옛 링크 404, 재발행은 새 slug) | `forbidden` · `trailer_state_invalid` |
| `public_trailer(p_slug text) returns jsonb` | anon, authenticated | `published`이고 slug 일치이며 **읽는 시점에도 `scenarios_hash = gate_passed_hash = approval_hash`이고 조직 공개 허용이 켜져 있을 때만** `{scenarios, apply_url}`. 발행 뒤 누가 시나리오를 바꿔도(트리거가 해시를 지운다) 공개 응답이 끊긴다. **이 두 키 외에는 반환하지 않는다**(부서·조직·원장·예고편 id 없음). 없으면 null. `schema_version <> 1`이면 예외 `trailer_schema_unsupported`(페이지가 404가 아닌 오류 화면을 보여 준다) | `trailer_schema_unsupported` |

### 2. 조직 관리자 (0026 확장)

| RPC | grant | 규칙 |
|---|---|---|
| `admin_set_trailer_publishing(p_enabled boolean)` | authenticated | 관리자만. `orgs.trailer_publish_enabled` 변경. **끄면 그 조직의 `published` 예고편을 전부 `unpublished`·slug null**. 기록 `trailer_publishing_toggle` `{org_id}` |
| `admin_unpublish_trailer(p_trailer uuid)` | authenticated | 관리자만, 같은 조직 예고편만. 기록 `trailer_unpublish` `{dept_id, trailer_id}` |
| `private._admin_overview(p_org uuid)` 교체(`create or replace`) | 없음 | 기존 키에 `trailer_publish_enabled`, `published_trailers:[{trailer_id, dept_name, title, published_at, public_path}]` 추가. `title`은 첫 시나리오 `title`, `public_path`는 `/t/<slug>` |

- `demo_admin_overview()`는 내부 함수를 그대로 쓰므로 데모 조직의 발행본도 보인다. 별도 로직을 만들지 않는다.
- 부서장은 조직 공개 허용을 바꿀 수 없다(설계 §B-3 표: 부서장은 철회만).

### 3. 롤백 SQL

`0027_trailer_publish_down.sql`에 이 step의 함수를 추가하고, `private._admin_overview`를 **0026의 정의로 되돌리는** 문을 넣는다(0026 파일의 함수 본문을 그대로 복사).

### 4. 하니스 케이스 (PRD §11 예고편 발행 행)

1. 검사 실패(`gate_passed_hash` null) → `publish_trailer` `trailer_gate_not_passed`.
2. 검사 통과 + 항목 미승인 → `trailer_not_approved`.
3. 검사 통과 + 전 항목 승인 + 조직 허용 off → `trailer_publishing_disabled`.
4. 세 조건 충족 → slug 22자 `[a-z0-9]` · 같은 호출 재실행 → 같은 slug.
5. 발행 상태에서 부서장 `update_trailer_scenarios` → `trailer_state_invalid` · service_role이 발행본 시나리오를 직접 바꾸면 → `public_trailer(slug)` null(읽기 시점 해시 확인).
6. anon `public_trailer(slug)` → 응답 최상위 키 집합 = `{apply_url, scenarios}` 정확히 일치.
7. 철회 → 옛 slug `public_trailer` null → 다시 `review`로 수정·재검사·재승인(service_role로 검사 기록 재현) → 재발행 slug ≠ 옛 slug.
8. `schema_version=2`로 바꾼 발행본 → `trailer_schema_unsupported`.
9. 조직 관리자 공개 허용 off → 그 조직 발행본 전부 `unpublished` · `admin_events`에 `trailer_publishing_toggle`.
10. B 조직 관리자가 A 조직 예고편 `admin_unpublish_trailer` → `forbidden` · member가 `admin_set_trailer_publishing` → `forbidden` · 부서장이 `admin_set_trailer_publishing` → `forbidden`.
11. `admin_overview()` 키 집합이 새 키 포함해 정확히 일치 · `published_trailers`에 원장 id·결정 텍스트 없음.
12. 함수 권한 표 확장(`public_trailer`만 anon) · 맨 끝 롤백 블록에서 0027 down 후 `_admin_overview` 키가 0026 집합으로 돌아온다.

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
2. 체크리스트: `publish_trailer`가 세 조건을 전부 SQL에서 확인하는가 · `public_trailer` 응답이 두 키뿐인가 · 철회가 slug를 지우는가 · 관리자 RPC가 조직 일치를 확인하는가 · 롤백이 0026 정의를 복원하는가.
3. `phases/11-trailer-publish/index.json` step 1을 갱신한다.

## 금지사항

- 운영 DB에 적용하지 마라. 이유: O11 승인 노드다.
- 파일럿 조직의 `trailer_publish_enabled`를 켜는 SQL·스크립트를 만들지 마라. 이유: PRD §10 #25 — 법률 자문 전에는 데모 조직으로만 시연한다.
- `lib/site.ts`의 slug 정규식을 바꾸지 마라. slug 형식을 거기에 맞춘다.
- 앱 코드(`app/`·`components/`·`lib/`)를 수정하지 마라. 이유: step 2 이후 범위다.
