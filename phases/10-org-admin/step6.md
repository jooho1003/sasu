# Step 6: admin-verification

## 읽어야 할 파일

- `/docs/PRD.md` §11 "조직 관리자 (ADR-044)" 행 전체 — 이 step은 그 행을 실행 가능한 스펙과 기록으로 옮긴다
- `/docs/ARCHITECTURE.md` §8 테스트 경계 · §6-2 불변식 22
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §L1 전체 여정의 "조직 관리자"·"초대받은 사람" 흐름 · §L3
- step 0~5 산출물 전부 (특히 `app/api/admin/**`, `app/invite/[token]/page.tsx`, `app/demo/admin/page.tsx`, `scripts/grant-org-admin.ts`)
- E2E 패턴: `tests/e2e/ask-permission.spec.ts` 36~72행(세션 쿠키 주입), `tests/e2e/guest.spec.ts` 61행~(열람 전후 행 수 불변), `tests/e2e/support/auth.ts`(phase 8 step 1에서 생겼다면 재사용), `playwright.config.ts`
- `scripts/seed-dept.ts`(`ensureUser`), `.env.example`

## 작업

### 1. QA 조직 시드 스크립트 `scripts/seed-qa-org.ts`

운영 DB E2E를 실제 파일럿 조직과 섞지 않기 위한 전용 조직이다. **작성만 하고 실행하지 않는다**(O10에서 실행).

- 조직 `사수 QA`(고정 UUID, `is_demo=false`)를 upsert한다.
- 계정: `SEED_ORG_ADMIN_EMAIL`/`PASSWORD`(조직 관리자, 부서 멤버 아님) · `SEED_INVITEE_EMAIL`/`PASSWORD`(멤버십 없음). `seed-dept.ts`의 `ensureUser` 방식으로 만든다.
- `org_admins`에 관리자를 `granted_by='script:seed-qa-org'`로 upsert한다.
- `--reset`: QA 조직의 대기 초대를 철회 처리(`revoked_at`·해시 무효화)하고, 초대 대상 계정의 QA 조직 멤버십을 지운다. 부서·`admin_events`는 지우지 않는다.
- 출력은 id와 개수만. 비밀번호·이메일을 출력하지 않는다.
- `.env.example`에 `SASU_ORG_ADMIN_MODE=off`, `SEED_ORG_ADMIN_EMAIL=`, `SEED_ORG_ADMIN_PASSWORD=`, `SEED_INVITEE_EMAIL=`, `SEED_INVITEE_PASSWORD=`, `E2E_ORG_ADMIN_DB=`를 주석과 함께 추가한다.

### 2. E2E `tests/e2e/org-admin.spec.ts`

**A. 항상 실행(DB 쓰기 없음)** — 기본 서버(플래그 없음 = `off`):
- `/admin`, `/admin/members`, `/invite/abc`, `/demo/admin` → 404
- `POST /api/admin/departments` → 404
- `/demo`에 `/demo/admin` 링크 0개

**B. 운영 DB 필요** — `E2E_ALLOW_EXTERNAL_WRITES=1`, `E2E_ORG_ADMIN_DB=1`, QA 계정 env가 모두 있을 때만. 서버는 `SASU_ORG_ADMIN_MODE=on`으로 띄운 `E2E_BASE_URL`을 쓴다. 테스트 이름에 PRD §11 문구를 쓴다.
1. 관리자 세션 → `/admin` 렌더 · 부서 `E2E-<timestamp>` 생성 → "부서장 없음" 배지
2. 첫 부서장 초대에 관리자 자기 이메일 → "자기 이메일" 오류 문구 · 초대 대상 이메일 → 링크 받음
3. **로그아웃 → 초대 링크 → 매직링크 → 표시 이름 → 수락 → 동의 → 부서 도착**: 쿠키 없는 새 컨텍스트로 초대 링크 → "이 이메일로 로그인" 링크의 `next` 확인 → 매직링크는 service role `auth.admin.generateLink({type:"magiclink"})`의 `hashed_token`을 anon 클라이언트 `verifyOtp({type:"magiclink", token_hash})`로 교환해 세션 쿠키를 주입하는 방식으로 대신한다(메일함 접근 없음) → 표시 이름 입력 → 수락 → `/consent?next=/d/<dept>` → 동의 → `/d/<dept>` 도착
4. 다른 이메일 계정(`SEED_MEMBER_*`) 세션으로 새 초대 링크 수락 → 불일치 문구 + 로그아웃 폼
5. 새 부서장(초대 대상 계정) 세션 → `/d/<dept>/settings`에서 멤버 초대 링크 생성 가능 · 관리자 세션 → 그 부서의 유일한 부서장 [부서장 해제] → "마지막 부서장" 문구
6. 관리 RPC 응답 화이트리스트: 관리자 세션 토큰으로 `admin_overview`·`admin_members`·`admin_answer_stats`를 PostgREST로 직접 호출 → 응답 키 전수 확인(`question`·`content`·`quote`·`asked_by` 없음, 집계 행에 id·시각 없음)
7. `/demo/admin`(쿠키 없음): 렌더 HTML에 `@` 포함 이메일 패턴 0 · "대기 중 초대"·"관리 기록" 없음 · 열람 전후 `llm_calls`·`member_invites`·`admin_events`·`members` 행 수 불변(service role로 count)
- `afterAll`: `seed-qa-org.ts --reset`과 같은 정리를 service role로 수행하거나, 스크립트를 호출하지 않고 정리가 필요한 id만 출력한다.

로그·첨부에 토큰·이메일·비밀번호를 남기지 않는다. 초대 URL은 변수로만 다룬다.

### 3. 로컬 AC 실행과 기록 `docs/verification/org-admin.md`

- 이번 step에서 실행한 것(A 그룹, 단위·라우트 테스트, SQL 하니스, 빌드, 기존 `guest`·`team-coverage`·`site` E2E 회귀)의 실제 출력 요약을 적는다.
- B 그룹은 "O10에서 실행"으로 적고, O10이 그대로 쓸 명령을 순서대로 적는다: 부서명 중복 읽기 조회 SQL → `supabase db push`(0026) → 배포(`SASU_ORG_ADMIN_MODE=off`) → `npx tsx scripts/seed-qa-org.ts` → `SASU_ORG_ADMIN_MODE=on npm run start -- --port <p>` → `E2E_BASE_URL=… E2E_ALLOW_EXTERNAL_WRITES=1 E2E_ORG_ADMIN_DB=1 npm run e2e -- tests/e2e/org-admin.spec.ts` → 데모 시드 → 모드 `on` 배포.
- 매직링크 실제 메일 경로(쿠키 `next` → 콜백)는 E2E가 대신하지 못한다는 한계를 적는다. O10에서 사람이 실제 메일로 1회 확인하는 항목으로 남긴다.

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"
npm run start -- --port 3115   # 별도 터미널, 플래그 없음
E2E_BASE_URL=http://127.0.0.1:3115 npm run e2e -- tests/e2e/org-admin.spec.ts tests/e2e/guest.spec.ts tests/e2e/team-coverage.spec.ts tests/e2e/site.spec.ts
# 기대: org-admin A 그룹 통과, B 그룹 skipped, 기존 스펙 통과
```

(PowerShell에서는 `$env:E2E_BASE_URL = 'http://127.0.0.1:3115'` 형식으로 설정한다.)

## 검증 절차

1. AC를 실행하고 결과 수치를 `docs/verification/org-admin.md`에 적는다.
2. 체크리스트: B 그룹이 env 없이 절대 실행되지 않는가 · 스펙이 service role을 검증용 조회·세션 발급에만 쓰는가 · PRD §11 조직 관리자 행의 모든 항목이 하니스(step 0·1) 또는 이 스펙에 매핑됐는가(문서에 매핑 표).
3. `phases/10-org-admin/index.json` step 6을 갱신한다. B 그룹 미실행을 summary에 명시한다.

## 금지사항

- `E2E_ALLOW_EXTERNAL_WRITES=1`로 실행하거나 `seed-qa-org.ts`·`grant-org-admin.ts`·`seed-demo.ts`를 실행하지 마라. 이유: 운영 Auth·DB 쓰기는 O10 승인 범위다.
- B 그룹을 skip한 결과를 "통과"로 기록하지 마라. 이유: 완료는 실행 기록으로 판정한다(ADR-026).
- 실패를 고치려고 앱 코드·SQL을 크게 바꾸지 마라. 스펙이 드러낸 결함은 최소 수정하고, 권한 판정이나 마이그레이션 변경이 필요하면 `blocked`로 보고한다.
