# Step 3: trailer-routes

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §6 불변식 2·3 · §6-2 불변식 20
- `/docs/ADR.md` ADR-045 · ADR-024
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §C-3 흐름도 · §C-5 화면 표(버튼이 부르는 동작) · §L3 표(422·연타·재발행·상한·https) · §L4 9
- step 0~2 산출물: `supabase/migrations/0027_trailer_publish.sql`(RPC 이름·오류 코드), `lib/trailer-gate.ts`, `lib/trailer-generation.ts`(`DEFAULT_TRAILER_RUBRIC`), `lib/contracts.ts`, `lib/features.ts`(`trailerPublishEnabled`, `orgAdminWritesEnabled`), `lib/pipeline/trailer-generate.ts`·`trailer-gate.ts`(register 함수)
- 기준 패턴: `app/api/d/[dept]/roles/[roleId]/runs/route.ts` 82~170행(enqueue dedupeKey → register → `kickWorker`), `tests/agent-role-routes.test.ts`, phase 10의 `app/api/admin/**`와 `tests/org-admin-routes.test.ts`(오류 매핑·플래그 404)
- `lib/trailer.ts`(`validateScenario`), `lib/jobs.ts`(`enqueue`, `kickWorker`)

## 작업

공통 규칙(phase 10 step 3과 같다): 첫 줄 플래그 검사(`trailerPublishEnabled()` false → 404) · `requireMembership` + lead 아니면 403 · 권한 필드 제거 · Zod · 세션 클라이언트 RPC만 · 오류 매핑 42501→403, 22023→400, P0001→409(단 `trailer_daily_limit`→429) · 로그에 시나리오·금지어·공고 URL 원문 금지.

### 1. 부서장 라우트 (`app/api/d/[dept]/trailers/**`)

| 경로 | 메서드 | 동작 |
|---|---|---|
| `trailers/route.ts` | GET | 세션 클라이언트로 그 부서 `trailers` 목록(id·status·status_reason·첫 시나리오 제목·published_at·slug·updated_at). RLS가 부서장만 보이게 한다 |
| 같은 파일 | POST `{decisionIds, bannedTerms, applyUrl}` | `create_trailer_draft`(기준표는 서버가 `DEFAULT_TRAILER_RUBRIC`을 넣는다) → `enqueue("generate_trailer", {trailerId}, {dedupeKey: id:updated_at})` → `registerTrailerGenerateHandler()` → `kickWorker()` → 202 `{trailerId}` |
| `trailers/candidates/route.ts` | GET | `trailer_candidates` |
| `trailers/[id]/route.ts` | PATCH `{scenarios, seenUpdatedAt}` | 먼저 서버에서 `runTrailerGate`의 스키마 검사와 같은 규칙(배열 1~3, 각 `validateScenario`, id 중복 없음)으로 검증 → 실패 422 `{error:"invalid_scenarios", fields:[path…]}` → `update_trailer_scenarios` → `check_trailer_gate` enqueue + kick → 202 |
| 같은 파일 | DELETE | `delete_trailer` |
| `trailers/[id]/regenerate/route.ts` | POST | `regenerate_trailer` → `generate_trailer` enqueue + kick |
| `trailers/[id]/recheck/route.ts` | POST | `request_trailer_recheck` → `check_trailer_gate` enqueue + kick |
| `trailers/[id]/approve/route.ts` | POST `{itemIds}` | `approve_trailer_items` → `{approvedCount, totalCount, complete}` |
| `trailers/[id]/publish/route.ts` | POST | `publish_trailer` → `{slug, publicPath: "/t/<slug>"}` |
| `trailers/[id]/unpublish/route.ts` | POST | `unpublish_trailer` |

- `applyUrl`은 서버에서도 `https:`만 허용한다(SQL과 이중). 금지어는 `btrim` 후 빈 값 제거, 최대 50개.
- 원장 결정 id는 요청 본문에서 받지만, 부서 일치·가시성·최신 여부 판정은 SQL(`create_trailer_draft`)이 한다. 라우트가 결정 테이블을 읽어 판정하지 않는다.
- 캐시 무효화는 하지 않는다. 공개 페이지는 step 5에서 `force-dynamic`이다.

### 2. 조직 관리자 라우트

| 경로 | 메서드 | 동작 |
|---|---|---|
| `app/api/admin/trailer-publishing/route.ts` | POST `{enabled}` | `orgAdminWritesEnabled()`와 `trailerPublishEnabled()` 둘 다 true일 때만 → `admin_set_trailer_publishing` |
| `app/api/admin/trailers/[id]/unpublish/route.ts` | POST | 같은 플래그 조건 → `admin_unpublish_trailer` |

### 3. 테스트 `tests/trailer-routes.test.ts`

- 플래그 off → 모든 예고편 라우트 404, 관리자 예고편 라우트는 두 플래그 중 하나라도 off면 404
- member → 403, RPC 미호출
- POST 생성: 본문의 `rubric`·`dept_id`·`org_id`가 RPC로 전달되지 않고 서버 기준표가 들어간다 · enqueue dedupeKey 형식 · 202
- PATCH: 무효 시나리오 → 422와 필드 경로, RPC 미호출 · 유효 → RPC 후 `check_trailer_gate` enqueue
- `trailer_daily_limit` → 429 · `trailer_publishing_disabled`·`trailer_not_approved`·`trailer_gate_not_passed` → 409와 한국어 메시지
- `http://` 공고 → 400, RPC 미호출
- publish 연타 두 번 → 둘 다 같은 slug(모킹한 RPC가 같은 값을 돌려줄 때 라우트가 그대로 전달)
- `console.*`에 시나리오 텍스트·금지어가 찍히지 않는다(spy)

## Acceptance Criteria

```bash
npm run test -- tests/trailer-routes.test.ts
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"
```

## 검증 절차

1. AC를 실행한다.
2. 체크리스트: 요청 경로 service role import 0 · 발행 조건 판정을 라우트가 복제하지 않았는가(SQL만) · 모든 쓰기 라우트가 job을 넣은 뒤 `kickWorker`를 부르는가 · 오류 응답에 원문이 없는가.
3. `phases/11-trailer-publish/index.json` step 3을 갱신한다.

## 금지사항

- 발행 가능 여부(검사 통과·전 항목 승인·조직 허용)를 TS에서 판정해 RPC 호출을 건너뛰지 마라. 이유: 판정은 SQL 한 곳이다(불변식 20). 화면용 표시는 step 4가 RPC 결과로 한다.
- `record_trailer_gate`를 부르는 라우트를 만들지 마라. 이유: service_role 전용 워커 경로다.
- 파일럿 조직의 공개 허용을 켜는 코드·시드를 넣지 마라. 이유: PRD §10 #25.
- 화면을 만들지 마라. 이유: step 4 범위다.
