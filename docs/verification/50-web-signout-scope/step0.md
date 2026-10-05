# Step 0 검증: signout-scope

2026-10-05 · phase 50 · 원천 ADR-089, PRD §8 "웹 로그아웃 범위" · 설계 [web-signout-scope.design.md](../../02-design/features/web-signout-scope.design.md) §4·§8

## 변경

- `app/auth/signout/route.ts` (E1): `auth.signOut()` → `auth.signOut({ scope: "local" })`. `next` 정리·303·GET 405는 그대로.
- `app/demo/access/route.ts` (E2): 심사 계정 확인 실패 정리의 `auth.signOut()` → `auth.signOut({ scope: "local" })`. 리디렉션(`/demo?demo=unavailable`)·no-store 헤더·성공 경로는 그대로.
- 타입 확인: 설치된 `@supabase/supabase-js` 2.116.0의 `SignOut.scope`는 `'global' | 'local' | 'others'`. 인자를 빼면 기본값이 `global`이라 같은 사용자의 모든 refresh token이 폐기된다. 데스크톱 `desktop/src/main/auth/supabase.ts`는 이미 `scope: "local"`이다(참고만, 변경 없음).
- `scope: "global"` 버튼·"모든 기기 로그아웃" UI·service role·새 API/DB는 추가하지 않았다.

## 테스트 (테스트 먼저)

- U1 `tests/auth-signout-route.test.ts` (신규, 4건): signOut이 `{ scope: "local" }`로 정확히 1회 / next 없음 → 303 `/login` / 내부 `next=/demo` 유지·`next=//evil.example` → `/login`(모든 호출 인자 `{ scope: "local" }`) / GET 405·`Allow: POST`·signOut 미호출.
- U2 `tests/demo-access.test.ts` (확장, 라우트 4건 추가): 다른 계정 로그인 → `{ scope: "local" }` 1회·303 `/demo?demo=unavailable` / 오류+세션 → `{ scope: "local" }` 1회 / 세션 없는 실패 → signOut 미호출 / 심사 계정 성공 → signOut 미호출·303 `/demo`.
- 기존 `tests/org-admin-routes.test.ts`의 로그아웃 테스트(`toHaveBeenCalledOnce`, 303 `/login`)는 수정 없이 회귀로 함께 실행.

## Red → Green

| 단계 | 명령 | 결과 |
|---|---|---|
| red (구현 전) | `npx vitest run tests/auth-signout-route.test.ts tests/demo-access.test.ts` | 2 files failed · **4 failed / 9 passed (13)**. 실패 4건 모두 `expected ... to be called with arguments: [ { scope: 'local' } ]`, 실제 인자 `[]` — 기대한 이유 |
| green (구현 후) | `npx vitest run tests/auth-signout-route.test.ts tests/demo-access.test.ts tests/org-admin-routes.test.ts` | **3 files · 26 passed (26)** (U1 4 · demo-access 9 · org-admin-routes 13) |

## 전체 검증 (worktree `.vercel/wt-signout`)

| 명령 | 결과 |
|---|---|
| `npm run lint` | exit 0. ESLint 0 errors / 3 warnings(변경과 무관한 기존 파일: `docs/verification/43-desktop-companion/first-run-2026-10-05/flow.mjs`, `tests/e2e/settings-devices-local.spec.ts`). 문구 검사 scanned 266 · **blocking 0** · warnings 84(기존) |
| `npm run build` (기본) | **exit 1 — 환경 문제.** `TurbopackInternalError: Symlink [project]/node_modules is invalid, it points out of the filesystem root`. worktree의 `node_modules`가 메인 체크아웃으로 가는 junction이고, Next 16.3.4는 git worktree 경계를 root로 잡는다. phase 45·46·47 기록과 같은 증상. [root-build-default.txt](root-build-default.txt) |
| `NEXT_PRIVATE_OUTPUT_TRACE_ROOT='D:\바이브코딩\sasu' npm run build` | **exit 0.** Next 16.3.4 (Turbopack) · Compiled successfully in 5.3min · TypeScript 112s · 정적 페이지 50/50 · `/auth/signout`·`/demo/access` ƒ 라우트 포함. 제품 `next.config.ts`는 바꾸지 않고, Next가 읽는 root 환경변수만 junction 대상이 포함된 메인 리포 루트로 지정했다(같은 bundler 유지). 산출물은 worktree의 `.next`. [root-build-turbopack-root-env.txt](root-build-turbopack-root-env.txt) |
| `npm run test` | exit 0. **187 files · 1,889 passed (1,889)** |

- 빌드 후 추적 파일 변경 없음(`git status`에 `next-env.d.ts` 등 추가 변경 없음).
- 운영 반영·커밋·푸시는 하지 않았다. P1(운영 세션 2개 교차 확인)은 병합 후 단계다.

## 도구 기록 공백

- Graft·Archify: 인자 1개 변경으로 구조·실행 흐름이 바뀌지 않아 실행하지 않았다. 의존 관계는 두 라우트가 `createServerSupabaseClient().auth.signOut`만 부르는 것을 직접 확인했다.
