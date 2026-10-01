# Step 0: setup-gates

## 읽어야 할 파일

- `docs/PRD.md` §3-8(DC-01~12)·§8-1 데스크톱 행·§11 "데스크톱 동반 앱" 행
- `docs/ARCHITECTURE.md` §6 불변식 2·3·9, §6-12 불변식 46~50, §8 테스트 경계(desktop 두 행)
- `docs/ADR.md` ADR-082 결정 3·4·10
- `docs/02-design/features/desktop-companion.design.md` §1.2·§7(S2)·§10·§11.3
- `docs/AI-DEVELOPMENT.md` §2~3
- `tsconfig.json`, `eslint.config.mjs`, `scripts/check-wording.mjs`, `scripts/hooks/tdd-guard.sh`, `scripts/test_hooks.py`
- `scripts/review-qa.mjs`(로컬 QA Supabase 준비 방법)

## 작업

이 step은 이후 step이 막히지 않도록 루트 설정을 고치고, 설계의 두 전제를 **로컬에서** 실측한다. 앱 코드·마이그레이션은 만들지 않는다.

1. 루트 설정 — `desktop/`는 별도 패키지다(ADR-082 결정 2).
   - `tsconfig.json` `exclude`에 `desktop`을 넣는다. `next build` 타입 검사가 Electron 타입을 읽지 않게 한다.
   - `eslint.config.mjs` ignores에 `desktop/**`를 넣는다.
   - `scripts/check-wording.mjs`의 기본 검사 대상에 `desktop/src/renderer/**/*.tsx`를 넣는다. 폴더가 아직 없어도 실패하지 않아야 한다.
   - `scripts/hooks/tdd-guard.sh`에 ARCHITECTURE §8의 desktop 비대상 경로를 허용 목록으로 추가한다: `desktop/src/main/{index,ipc,tray,shortcut,notify,updater}.ts`, `desktop/src/main/{windows,auth,api,storage}/**`, `desktop/src/preload/**`, `desktop/src/renderer/**`, `desktop/*.{json,ts,yml}` 설정 파일. `desktop/src/main/core/**`·`desktop/src/shared/**`는 **대상**으로 남기고, 같은 폴더의 `__tests__/<name>.test.ts`를 테스트로 인정한다.
   - `scripts/test_hooks.py`에 위 허용·차단 사례를 추가한다(대상 경로가 테스트 없이 차단되는지, `__tests__`가 있으면 통과하는지, 비대상 경로가 통과하는지).
2. 게이트 G1 — 해제 시 세션 삭제 권한(design §7 S2). 로컬 QA Supabase(`node scripts/review-qa.mjs setup`)에서 읽기·롤백만으로 확인한다.
   - `select has_table_privilege('postgres','auth.sessions','DELETE')`와 `auth.sessions` 소유자.
   - 트랜잭션 안에서 postgres 소유 `security definer` 임시 함수가 `auth.uid()`의 세션 행 하나를 지울 수 있는지(역할 `authenticated`, JWT 클레임 설정) 확인 후 `rollback`.
3. 게이트 G2 — 6자리 코드 로그인과 세션 ID(ADR-082 결정 3·10). 로컬 QA에서:
   - 동의한 테스트 사용자로 `auth.admin.generateLink({type:'magiclink', email})`의 `properties.email_otp`를 받아, anon 클라이언트 `verifyOtp({email, token, type:'email'})`로 세션을 만든다. 이 관리자 호출은 **검증 스크립트 전용**이다.
   - access token payload에 `session_id`가 있고 `auth.sessions.id`와 같은지 확인한다.
   - anon key + `Authorization: Bearer` 클라이언트의 `getUser(token)`이 성공한 뒤, 그 `auth.sessions` 행을 지우면 (1) `getUser`가 사용자 없이 오류를 내고(supabase-js는 서버의 `session_not_found`를 `AuthSessionMissingError`·코드 없음으로 바꾼다 — 코드 이름으로 판정하지 않는다), (2) `GET /auth/v1/user` 원응답이 403 `session_not_found`이고, (3) 그 세션의 refresh token이 거부되는지 확인한다. `scripts/verify-companion-gates.mjs`는 2026-10-01에 이 기준으로 고쳐졌고 로컬에서 G1·G2 PASS를 냈다.
   - `signInWithOtp({shouldCreateUser:false})`로 미가입 이메일이 거부되는지 확인한다.
   - 위를 `scripts/verify-companion-gates.mjs`로 남긴다(로컬 URL이 아니면 즉시 종료 — `review-qa.mjs`의 `local_supabase_required` 방식).
4. 결과를 `docs/verification/43-desktop-companion/gates.md`에 쓴다: 실행 명령·출력 요약·G1/G2 판정(PASS/FAIL).
5. Graft로 `lib/supabase/membership.ts`·`app/api/d/[dept]/{ask,answers/[id]}`·`app/api/cards/[id]/decide`·`app/api/d/[dept]/meetings/transcript`·`app/(auth)/d/[dept]/cards/[id]/page.tsx`의 호출·의존 관계를 확인하고, Archify로 "기기 연결 → 요청 → 해제" 흐름(design §2 mermaid 기준)을 그린다. 산출물은 `docs/verification/43-desktop-companion/`.

## 코드 관계와 구조 확인

Graft·Archify를 실행할 수 없으면 실제 파일을 읽어 확인한 범위와 빠진 도구 결과를 `gates.md`에 적는다. 도구 결과를 추정해 쓰지 않는다.

## Acceptance Criteria

```powershell
python scripts/test_hooks.py
npm run lint
npm run build
npm run test
node scripts/verify-companion-gates.mjs
git diff --check
```

- `gates.md`에 G1·G2가 각각 PASS로 기록되어 있다.
- **G1 또는 G2가 FAIL이면** 다른 해결책을 직접 고르지 말고 `"status": "blocked"`, `"blocked_reason": "G1|G2 실패: <관찰 결과>. design §7 S2 대안(해제된 연결의 다음 요청에서 admin signOut) 채택 여부는 사용자 판정"`으로 멈춘다.

## 검증 절차

1. 위 AC를 실행한다.
2. 루트 `next build`가 `desktop/`을 읽지 않는지, 기존 lint·test 수가 줄지 않았는지 확인한다.
3. `phases/43-desktop-companion/index.json`의 step 0을 갱신한다(성공 `completed`+summary, 3회 실패 `error`, 게이트 실패 `blocked`).

## 금지사항

- 운영 Supabase·운영 DB에 접속하지 마라. 이유: 운영 권한 확인은 운영 반영 승인 단계(O1)에서 사람이 한다.
- 마이그레이션 파일을 만들지 마라. 이유: step 1의 범위다.
- `auth.admin.*`·service role을 `app/`이나 `lib/`에 쓰지 마라. 이유: 검증 스크립트 전용이며 사용자 요청 경로에 들어가면 불변식 2 위반이다.
- 기존 미추적 `supabase/config.toml`·`supabase/.gitignore`를 바꾸지 마라. 이유: 다른 작업의 로컬 설정이다.
- 기존 테스트를 깨뜨리지 마라.
