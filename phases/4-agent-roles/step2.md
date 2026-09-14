# Step 2: agent-role-routes

## 읽어야 할 파일

- `/docs/ADR.md` **ADR-038**, ADR-024
- `/docs/PRD.md` §6-8 API 엔드포인트, §6-9 권한 모델, §11 "부서 역할"·"보안" 행
- `/docs/ARCHITECTURE.md` §3.2 무거운 일은 job · §3.4 · §6 불변식
- `supabase/migrations/0023_agent_roles.sql` (RLS·`request_agent_role_run` 예외 코드)
- `lib/contracts.ts` (`AgentRoleDefinition`), `lib/agent-role.ts`, `lib/pipeline/agent-role.ts` (step 1 산출물)
- `app/api/d/[dept]/documents/route.ts` (선례: `requireMembership` → 세션 클라이언트 → `enqueue` → `kickWorker` → 202)
- `lib/supabase/membership.ts`, `lib/supabase/server.ts`, `lib/mask.ts`
- `tests/write-boundaries-route.test.ts`, `tests/source-removal-route.test.ts` (라우트 테스트 mock 패턴)

## 작업

모든 라우트는 **세션 클라이언트**(`createServerSupabaseClient`)만 쓴다. `dept_id`는 `requireMembership(dept).deptId`에서 가져오고, 요청 본문에 `dept_id`·`created_by`·`requested_by`가 있어도 무시한다.

### 1. `app/api/d/[dept]/roles/route.ts`

- `GET`
  - `agent_roles`에서 `dept_id = membership.deptId`, `archived_at is null`을 created_at desc로 조회한다.
  - 반환 필드: `{ roles: [{id, name, instruction, criteria, visibility, created_at}] }`
  - RLS가 member에게서 leads_only를 걸러낸다.
- `POST`
  - `membership.role !== "lead"`면 403 "역할은 팀장만 만들 수 있습니다."
  - body를 `AgentRoleDefinition.safeParse` → 실패 시 400과 한국어 메시지 (필드 경로만, 입력 원문은 넣지 않음)
  - 저장 전에 `name`·`instruction`·criteria의 `label`·`description`에 `mask()`를 적용한다.
  - insert 값: `dept_id: membership.deptId`, `created_by: (await supabase.auth.getUser()).data.user.id`
  - RLS 거부(데모 부서 포함)는 403으로 돌려준다.
  - 성공 시 201 `{ role: {...} }`

### 2. `app/api/d/[dept]/roles/[roleId]/route.ts`

- `PATCH`: lead만 가능. body가 `{ archived: true }`일 때만 `archived_at = now()`로 update한다.
  - 역할의 `dept_id`는 `membership.deptId`와 같아야 한다.
  - 0행 업데이트는 404.

### 3. `app/api/d/[dept]/roles/[roleId]/runs/route.ts`

- `POST`: lead만 가능.
  - body `{ source_ids: string[] }`를 zod로 검증한다: uuid 1~20개, 중복 금지.
  - `supabase.rpc("request_agent_role_run", { p_role: roleId, p_sources })`를 호출한다.
  - 역할 부서가 `membership.deptId`가 아니면 RPC가 거부하지만, 라우트에서도 역할 select로 부서를 먼저 확인해 404를 낸다.
  - RPC 오류 메시지 매핑:
    - `agent_role_forbidden` → 403
    - `agent_role_sources_invalid` → 400 "이 부서의 처리 완료된 문서만 선택할 수 있습니다."
    - `agent_role_daily_limit` → 429 "오늘 역할 실행 한도(100건)를 넘었습니다."
    - 그 외 → 500
  - 반환된 행마다 `enqueue("run_agent_role", { resultId }, { dedupeKey: \`${result_id}:${updated_at}\` })`를 호출한다. 재실행이 이미 끝난 job id와 충돌하지 않게 하려는 것이다.
  - 이어서 `registerAgentRoleHandler()`와 `kickWorker()`를 부른다.
  - 202 `{ ok: true, results: [{result_id, source_id}] }`
- `GET`: 해당 역할의 `agent_role_results`를 `sources!inner(title)`와 조인해 조회한다.
  - 정렬: `weighted_score desc nulls last`, 그다음 `updated_at desc`
  - 반환 필드: `{ results: [{id, source_id, title, status, status_reason, result, weighted_score, visibility, updated_at}] }`
  - member도 호출할 수 있다 (RLS 집행).

### 4. 테스트 `tests/agent-role-routes.test.ts`

기존 라우트 테스트처럼 membership과 supabase를 mock한다. 최소 다음을 포함한다.

1. member의 POST roles / PATCH / POST runs → 403, insert·rpc 미호출
2. 잘못된 criteria(11개, key 중복, weight 6) → 400
3. body의 `dept_id`·`created_by`가 무시되고 membership·auth 값이 쓰임
4. 지시문의 이메일이 마스킹되어 insert됨
5. runs: rpc 예외 코드별 상태 코드
6. 정상 runs → 행마다 enqueue 1회, dedupeKey에 updated_at 포함, 202
7. source_ids 21개·비uuid → 400, rpc 미호출

## Acceptance Criteria

```bash
npx vitest run tests/agent-role-routes.test.ts
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

## 검증 절차

1. AC 커맨드를 실행한다.
2. 체크리스트: 이 라우트들에서 `createServiceSupabaseClient`를 import하지 않았는가 (`grep -n "createServiceSupabaseClient" app/api/d/\[dept\]/roles -r` 결과 0건) · `console.*`에 지시문·문서 본문을 넣지 않았는가.
3. `phases/4-agent-roles/index.json`의 step 2를 갱신한다.

## 금지사항

- 요청 경로에서 service role 클라이언트를 쓰지 마라 (`enqueue` 내부 구현은 예외). 이유: 필터 누락 한 줄이 곧 유출이다.
- 버튼 숨김으로 권한을 대신하지 마라. lead 판정은 서버와 RLS·RPC에서 한다.
- 역할 수정(PUT) 엔드포인트를 만들지 마라. 이유: 결과가 어떤 기준으로 나왔는지 추적이 끊긴다. 보관 후 새로 만든다.
