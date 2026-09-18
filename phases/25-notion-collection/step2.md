# Step 2: notion-installation

조직별 노션 연결 저장소를 만들고 전역 `NOTION_TOKEN` 경로를 없앤다. 연결 방식은 **내부 통합 토큰 붙여넣기**만 구현한다(OAuth는 step 8).

## 읽어야 할 파일

- `/docs/PRD.md` §3-5(NOT-01), §8 "ADR-060 노션 전체 수집 경계", §6-9 권한 모델
- `/docs/ADR.md` ADR-060, ADR-052(Slack 설치 규칙), ADR-044(조직 관리자 경계)
- `/docs/ARCHITECTURE.md` §6 불변식(특히 조직 관리 판정 `is_org_admin()`·요청 경로 service role 금지)
- `/docs/planning/노션_전체수집_설계.md` §3, §9
- 선례(그대로 따라 만든다): `supabase/migrations/0033_slack_installations.sql`, `lib/slack/installation.ts`, `lib/slack/workspace.ts`(AsyncLocalStorage로 job·요청 범위 토큰), `app/api/admin/slack/**`, `app/api/admin/_shared.ts`, `scripts/register-legacy-slack.ts`
- step 0 산출물: `lib/notion.ts`의 `runWithNotionAuth`·`notionWhoAmI`
- 호출부: `lib/pipeline/notion-import.ts`, `app/api/d/[dept]/settings/notion/route.ts`, `lib/worker.ts`
- RLS 하니스: `tests/rls/`, `scripts/verify-security-sql.mjs`

## 작업

1. 새 migration(다음 빈 번호) `notion_installations`:
   - `org_id` PK → orgs, `workspace_id text not null unique`, `workspace_name`, `bot_id`, `auth_kind text check in ('internal_token','oauth')`, `encrypted_token text`, `active boolean`, `installed_by`, `installed_at`, `revoked_at`, `attested_at timestamptz not null`(관리자가 업무 자료 수집 권한을 확인한 시각), `check(not active or encrypted_token is not null)`.
   - RLS 켜고 `public, anon, authenticated` 권한 회수, `service_role`만 직접 접근.
   - RPC(모두 `security definer`, `search_path` 고정, 기본 권한 회수 후 필요한 역할에만 grant):
     - `complete_notion_installation(p_actor, p_org, p_workspace, p_name, p_bot, p_kind, p_encrypted)` — service_role 전용. `org_admins` 소속·데모 조직 거부·암호문 형식(`^v1\.`)·워크스페이스가 다른 조직에 묶여 있지 않음(advisory lock)을 SQL에서 검증.
     - `notion_installation_for_department(p_dept)` — authenticated(부서장, `can_see(auth.uid(), dept, 'leads_only')`)·service_role. 암호문과 org/workspace id 반환.
     - `notion_installation_for_job(p_job)` — service_role 전용. `notion_import` payload의 `sourceId`에서 부서를 찾는다(이후 step의 job kind는 그 step에서 추가).
     - `admin_notion_installation()` — authenticated. `admin_org_id()` 기준, **토큰 없이** 메타데이터만.
     - `revoke_notion_installation()` — authenticated 조직 관리자. 토큰을 null로, `active=false`, 그 조직의 `notion_page` 소스를 `active=false, last_error='notion_disconnected'`로.
2. `lib/notion-installation.ts`(테스트 먼저 `tests/notion-installation.test.ts`): `encryptNotionToken(token, org, workspace)`/`decryptNotionToken(...)`. AES-256-GCM, AAD `sasu:notion:v1:${org}:${workspace}`. 키는 새 환경 변수 `NOTION_TOKEN_ENCRYPTION_KEY`(base64 32바이트). `.env.example`과 `docs/setup-guide.md`에 이름만 추가한다.
3. `app/api/admin/notion/route.ts`:
   - `POST {token, attested: true}` — 조직 관리자 세션·origin 검증(기존 admin 라우트와 같은 방식) → `runWithNotionAuth({token}, notionWhoAmI)`로 실제 검증(`workspaceId`가 null로 오는 통합이면 `bot:${botId}`를 워크스페이스 키로 쓴다 — step 0에서 실제 응답을 확인하지 못했다) → 암호화 → service role 어댑터로 `complete_notion_installation`. 토큰은 응답·로그에 넣지 않는다. `attested`가 true가 아니면 400.
   - `GET` — `admin_notion_installation()`. `DELETE` — `revoke_notion_installation()`.
   - 데모 조직·데모 계정은 기존 프록시/트리거 규칙대로 거부된다. 우회 경로를 만들지 않는다.
4. 토큰 해석을 한 곳에: `lib/notion-workspace.ts`의 `withNotionForDepartment(deptId, fn)`·`withNotionForJob(jobId, fn)`(Slack의 `lib/slack/workspace.ts`와 같은 모양). `importNotionSource`와 설정 라우트가 이것을 쓴다. 설치가 없으면 `notion_not_configured`.
5. `lib/notion.ts`에서 step 0의 임시 `process.env.NOTION_TOKEN` 읽기를 **삭제**한다. `scripts/register-legacy-notion.ts`를 만든다: 인자로 org id를 받고 환경의 기존 토큰을 `notionWhoAmI`로 검증한 뒤 같은 RPC로 저장(dry-run 기본, `--apply`로 실행). 스크립트는 실행하지 않는다.
6. `components/admin/**`·`app/admin/sources/page.tsx`에 최소 연결 카드: 상태, 토큰 입력(`type=password`), 권한 확인 체크박스, [연결]·[연결 해제]. 안내 문구에 "노션에서 최상위 페이지에 연결을 추가하면 하위 전체가 공유됩니다"와 "연결한 부서 범위가 곧 열람 범위"를 넣는다. 매핑 화면은 step 7이다.

## 코드 관계와 구조 확인

`NOTION_TOKEN` 참조 전수(`grep -rn NOTION_TOKEN`), `fetchNotionPage` 호출 경로, 워커에서 job id를 핸들러에 넘기는 방식을 확인해 `docs/verification/notion-collection/step2.md`에 적는다. 연결 흐름(관리자 → 라우트 → 노션 검증 → 암호화 → RPC)을 구조도로 남긴다(Archify 없으면 텍스트 흐름도 + "도구 결과 없음").

## Acceptance Criteria

```bash
npx vitest run tests/notion-installation.test.ts tests/notion.test.ts tests/pipeline/notion-import.test.ts tests/notion-reimport-route.test.ts
npm run lint && npm run build && npm run test
grep -rn "process.env.NOTION_TOKEN" lib app   # scripts/register-legacy-notion.ts 밖에서는 0건
```

로컬 Supabase(운영 아님)에서 RLS 하니스로 확인하고 결과를 기록한다: ① authenticated가 `notion_installations`를 직접 select/insert 불가 ② 다른 조직 관리자가 `admin_notion_installation()`으로 남의 설치를 못 봄 ③ 일반 멤버가 `notion_installation_for_department` 호출 시 빈 결과 ④ 데모 조직 설치 거부 ⑤ 같은 workspace를 두 조직에 묶으면 `23505` ⑥ 해지 후 토큰 null·소스 비활성.

## 검증 절차

AC → CRITICAL 점검(요청 경로 service role은 credential 저장 어댑터 한 곳뿐인가, 토큰이 로그·응답·클라이언트 번들에 없는가) → `index.json` step 2 갱신. 로컬 Supabase를 띄울 수 없으면 `blocked`로 두고 사유를 적는다(SQL 검증 없이 완료 처리 금지).

## 금지사항

- 전역 토큰 fallback을 남기지 마라. 이유: 토큰이 닿는 다른 조직의 페이지를 id만으로 가져올 수 있는 교차 테넌트 경로다.
- 조직 id·부서 id를 요청 본문에서 받지 마라. 이유: CLAUDE.md CRITICAL — 세션·멤버십에서 결정한다.
- 조직 관리자 RPC가 토큰·페이지 제목·본문을 반환하게 하지 마라. 이유: ADR-044.
- 운영 DB에 migration을 적용하거나 `register-legacy-notion.ts --apply`를 실행하지 마라. 이유: 운영 반영은 검증 기록과 사용자 승인 뒤다. 운영 반영 순서(레거시 이전 → 앱 배포)는 완료 기록에 적어 둔다 — 순서가 바뀌면 기존 노션 소스가 끊긴다.
- 커밋하지 마라. 다른 세션의 파일을 되돌리지 마라.
