# Phase 25 · Step 2 검증 기록 — notion-installation

검증일: 2026-09-18  
상태: **completed**

## 변경 파일

- `supabase/migrations/0038_notion_installations.sql` — 조직당 Notion 설치 1행, 암호문 저장, 최소 권한 RPC, 부서/job credential 조회, 관리자 메타데이터 조회, 해지 시 토큰 삭제·노션 소스 비활성을 추가했다.
- `lib/notion-installation.ts`, `tests/notion-installation.test.ts` — AES-256-GCM, AAD `sasu:notion:v1:${org}:${workspace}`, 32바이트 base64 키, nonce·변조·교차 조직/워크스페이스 거부를 테스트 후 구현했다.
- `lib/notion-workspace.ts`, `tests/notion-workspace.test.ts` — 부서·job SQL RPC로 얻은 설치만 복호화해 `runWithNotionAuth` 범위에 넣는다. 설치 없음·조회 실패·손상 암호문은 `notion_not_configured`로 닫는다.
- `tests/notion-installation-review.test.ts`, `tests/notion-workspace-review.test.ts` — 동시 리뷰에서 nonce·변조·ambient token 부재와 중첩된 다른 조직/해지 설치가 바깥 컨텍스트를 재사용하지 않는 회귀 검사를 보강했다.
- `lib/adapters/notion-installation.ts`, `tests/adapters/notion-installation.test.ts` — `/users/me` 검증을 마친 암호문만 service-role RPC에 전달하는 credential 수집 어댑터를 분리했다.
- `app/api/admin/notion/route.ts`, `tests/notion-admin-route.test.ts` — GET/POST/DELETE를 추가했다. POST/DELETE는 same-origin, POST는 세션 사용자·`admin_org_id()`·`attested: true`·실제 `/users/me` 응답을 검증한다. 응답·로그에 토큰을 넣지 않는다.
- `lib/notion.ts`, `tests/notion.test.ts` — 앱 런타임의 전역 `NOTION_TOKEN` fallback을 제거하고 요청 범위 토큰만 허용했다.
- `lib/jobs.ts`, `tests/jobs.test.ts` — `notion_import` claim의 실제 job id를 `withNotionForJob`에 넘긴 뒤 handler를 실행한다.
- `lib/pipeline/notion-import.ts`, `tests/notion-import.test.ts`, `app/api/d/[dept]/settings/notion/route.ts`, `tests/notion-reimport-route.test.ts` — import와 부서 설정 경로가 부서 설치 RPC를 통과하며 미설치는 `notion_not_configured`로 거부한다.
- `components/admin/notion-installation.tsx`, `app/admin/sources/page.tsx` — 상태, password 토큰 입력, 권한 확인 체크박스, 연결·연결 해제와 범위 안내만 최소 추가했다.
- `scripts/register-legacy-notion.ts` — `<org-uuid>` 입력, 기본 dry-run, `--apply` 때만 관리자와 검증된 기존 토큰을 같은 RPC로 이전한다. 실행하지 않았다.
- `.env.example`, `docs/setup-guide.md` — `NOTION_TOKEN_ENCRYPTION_KEY` 이름과 기존 `NOTION_TOKEN`의 이전 스크립트 전용 경계를 기록했다.
- `scripts/verify-notion-installations-sql.mjs`, `scripts/verify-security-sql.mjs` — 격리 PGlite 보안 하니스에 step 2의 여섯 SQL/RLS 시나리오를 연결했다.
- `scripts/review-notion-isolation.mjs`, `tests/notion-boundary-review.spec.ts` — 동시 리뷰가 데모 조직의 외부 호출 전 차단과 로컬 트랜잭션 기반 격리 assertion을 보강했다. 데모 preflight는 `admin_notion_installation()`의 SQL 거부를 재사용하도록 반영했다.
- `phases/25-notion-collection/index.json` — 이 기록 작성 뒤 step 2 상태와 요약만 갱신했다.

## 코드 관계·구조 확인

- `fetchNotionPage`의 런타임 호출자는 `lib/pipeline/notion-import.ts` 하나다. 이 호출은 `withNotionForDepartment` 안에서만 실행된다.
- `runOnce`는 claim한 `job.id`를 알고 있으므로 `notion_import`에 한해 `withNotionForJob(client, job.id, handler)`로 감싼다. SQL은 job payload의 `sourceId` → source의 `dept_id` → 조직 설치 순서로 찾는다. import 내부에서도 부서 RPC를 다시 확인해, 바깥 job 컨텍스트가 다른 부서·해지 설치를 우회하지 못한다.
- 부서 설정 라우트는 세션 클라이언트로 `notion_installation_for_department`를 먼저 호출한다. 조직/부서 id를 본문에서 받지 않는다.
- `process.env.NOTION_TOKEN`은 `scripts/register-legacy-notion.ts`에만 남았다. `lib/`·`app/` 런타임 검색은 0건이다.
- service role은 `lib/adapters/notion-installation.ts`의 검증된 credential 저장과 기존 worker/import 경로에만 있다. 관리자 GET/DELETE와 설정 화면은 세션 클라이언트다.
- Graft·Archify는 PATH에 없어 실행하지 못했다. 실제 파일과 `rg` 검색으로 위 의존 관계를 확인했으며 도구 결과는 없다.

## 연결 흐름

```text
조직 관리자 브라우저
  → POST /api/admin/notion (same-origin, 세션 사용자, admin_org_id, attested)
  → runWithNotionAuth(token) → Notion /v1/users/me
  → AES-256-GCM(org + workspace AAD)
  → credential 수집 어댑터(service role 한 곳)
  → complete_notion_installation(SQL 권한·데모·workspace 소유권 재검증)
  → notion_installations 암호문 저장

notion_import job
  → job id 기반 설치 RPC
  → source 부서 기반 설치 RPC 재확인
  → 복호화 토큰을 AsyncLocalStorage 범위에만 설정
  → fetchNotionPage
```

## 실행 명령과 결과

| 명령 | 결과 |
|---|---|
| `npx vitest run tests/notion-installation.test.ts tests/notion-workspace.test.ts tests/notion-admin-route.test.ts` (구현 전) | 예상 실패 — 새 모듈·라우트가 없어 3 suite 실패. TDD red 확인 |
| `npx vitest run tests/adapters/notion-installation.test.ts` (구현 전) | 예상 실패 — 새 수집 어댑터가 없어 1 suite 실패. TDD red 확인 |
| `npx vitest run tests/adapters/notion-installation.test.ts tests/notion-installation.test.ts tests/notion-installation-review.test.ts tests/notion-workspace.test.ts tests/notion-workspace-review.test.ts tests/notion-admin-route.test.ts tests/jobs.test.ts tests/notion.test.ts tests/notion-import.test.ts tests/pipeline/notion-import.test.ts tests/notion-reimport-route.test.ts` | 성공 — 11 files, 52 tests |
| `npx vitest run tests/notion-installation.test.ts tests/notion.test.ts tests/pipeline/notion-import.test.ts tests/notion-reimport-route.test.ts` | 성공 — 4 files, 16 tests |
| `npm run lint && npm run build && npm run test` | 최초 성공. 데모 외부 호출 preflight 보강 뒤 최종 상태에서 `npm run lint`, `npm run build && npm run test` 재실행도 성공 — Next.js 16 production build·TypeScript, 101 files / 1,136 tests. 중간 1회는 다른 세션의 동시 `next build` 잠금 때문에 중단되어 해당 빌드 자연 종료 뒤 재실행 |
| `grep -rn "process.env.NOTION_TOKEN" lib app` | 출력 0건. grep 관례상 exit 1 |
| `rg -n "NOTION_TOKEN_ENCRYPTION_KEY\|process\\.env\\.NOTION_TOKEN\|ntn_sensitive-token" .next/static` | 출력 0건 — 클라이언트 번들 비노출 |
| `node scripts/verify-security-sql.mjs 'D:/바이브코딩/.sasu-qa-db'` | 성공 — isolated PGlite 179 checks, failed 0, 권한 행렬 2,016 assertions |
| `node scripts/review-notion-isolation.mjs` | 성공 — 로컬 Supabase에서 16 Notion SQL isolation assertions, 전체 transaction rollback |
| 로컬 `supabase_db_review-qa` 컨테이너에 검증 전용 DB `sasu_notion_step2_verify_20260918` 생성 → `0004_worker_cron.sql` 제외 전체 migration 적용 → 여섯 SQL assertion 실행 → 전용 DB 제거 | 성공 — `LOCAL_SUPABASE_NOTION_STEP2_OK`; 제거 후 동일 DB 이름 0건. 공유 `review-qa` DB 스키마는 변경하지 않음 |
| `git diff --check -- <step 2 tracked files>` | 오류 없음. 기존 Windows CRLF 변환 경고만 출력 |

Vitest는 기존 Vite native config loader·`vite-tsconfig-paths` 경고를 출력했으나 실패는 없었다.

## 로컬 Supabase SQL/RLS 확인

로컬 Docker의 Supabase Postgres에 공유 DB와 분리한 검증 전용 DB를 만들고 migration을 처음부터 적용해 확인했다.

1. `authenticated`가 `notion_installations` 직접 SELECT/INSERT 불가 — 통과.
2. 다른 조직 관리자의 `admin_notion_installation()`은 자기 조직 설치만 반환하고 암호문 키가 없음 — 통과.
3. 일반 멤버의 `notion_installation_for_department`는 null — 통과.
4. 데모 조직 설치는 SQLSTATE `42501` — 통과.
5. 같은 workspace를 다른 조직에 연결하면 SQLSTATE `23505` — 통과.
6. 해지 후 `encrypted_token is null`, 설치·해당 조직 `notion_page` 소스 비활성 및 `last_error='notion_disconnected'` — 통과.

검증 전용 DB는 확인 직후 제거했고 운영 DB·운영 배포·공유 로컬 DB에는 migration을 적용하지 않았다. `npx supabase db push`도 실행하지 않았다.

## CRITICAL 점검

- 요청 경로의 service role 직접 import는 lint가 차단했고, 검증된 credential 저장을 `lib/adapters/notion-installation.ts` 한 곳으로 분리했다.
- 토큰은 입력 요청 → Notion 검증 → 암호화 동안 서버 메모리에만 있으며 응답·로그·SQL 메타데이터 RPC·클라이언트 번들에 없다.
- workspace id가 없는 실제 응답은 `bot:${botId}`를 workspace key로 사용한다.
- 데모 조직은 authenticated SQL preflight에서 403으로 닫혀 `/v1/users/me` 외부 호출과 credential 저장이 모두 0건이다.
- 조직 id·부서 id는 요청 본문에서 받지 않고 세션 RPC·멤버십·job/source 관계에서 정한다.
- 조직 관리자 메타데이터 RPC는 토큰·페이지 제목·본문을 반환하지 않는다.
- 해지는 세션 RPC로 실행되고 토큰을 null로 만든 뒤 해당 조직의 Notion 소스를 비활성화한다.

## 미실행 항목

- 테스트 워크스페이스 토큰이 제공되지 않아 실제 Notion `/v1/users/me`와 페이지 호출은 실행하지 않았다.
- `scripts/register-legacy-notion.ts`는 지시대로 dry-run 포함 실행하지 않았다.
- 운영 반영 순서는 **기존 조직 토큰을 `register-legacy-notion.ts --apply`로 먼저 이전 → 앱 배포**다. 순서를 바꾸면 전역 fallback이 제거된 기존 노션 소스가 끊긴다. 이번 작업에서는 운영 DB migration·운영 배포·실제 외부 워크스페이스 호출을 모두 실행하지 않았다.

## 오케스트레이터 리뷰 (2026-09-18, Claude)

- 확인: 관리자 라우트는 세션·`admin_org_id()`·origin·데모 거부·`attested` 검사 뒤 `/users/me`로 토큰을 검증하고 암호문만 service role 어댑터로 저장한다. 토큰은 응답·로그에 없다. 워커는 `withNotionForJob`으로 job 범위 토큰을 해석하고, 전역 `NOTION_TOKEN` 런타임 참조는 0건이다. `notion_installation_for_department`가 부서장 세션에 암호문을 돌려주는 것은 Slack(0033)과 같은 선례다.
- 보완(migration 0038): 같은 조직이 **다른 워크스페이스**로 다시 연결하면 이전 워크스페이스의 `notion_page` 소스를 `active=false, last_error='notion_disconnected'`로 정리한다. 새 토큰으로는 읽을 수 없어 소스마다 실패가 쌓이는 것을 막는다. 설계 §3 "재설치는 같은 조직/워크스페이스만"의 완화 — 교체는 허용하되 옛 소스는 닫는다.
- 재실행: `node scripts/verify-security-sql.mjs 'D:/바이브코딩/.sasu-qa-db'` → 179 passed / 0 failed. `npx vitest run tests/notion` → 9 files / 38 tests 통과. eslint(신규 파일) 출력 없음.
- 미검증 유지: 실제 노션 워크스페이스 토큰으로 `/users/me`의 `workspace_id` 존재 여부. 운영 반영 순서: `register-legacy-notion.ts --apply`(레거시 이전) → 0038 적용 → 앱 배포. 순서가 바뀌면 기존 노션 소스가 `notion_not_configured`로 멈춘다.

