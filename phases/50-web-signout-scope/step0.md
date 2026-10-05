# Step 0: signout-scope

## 읽어야 할 파일
- `/AGENTS.md` · `/docs/ADR.md` ADR-089 · `/docs/PRD.md` §8 "웹 로그아웃 범위"
- `/docs/02-design/features/web-signout-scope.design.md` §4·§8
- `app/auth/signout/route.ts`, `app/demo/access/route.ts`, 관련 기존 테스트(`tests/`에서 `auth/signout`·`demo/access`·`signOut` 검색)
- `desktop/src/main/auth/supabase.ts`(이미 `scope: "local"` — 참고만)

## 작업
1. 테스트 먼저(red 확인): E1 signout 라우트가 `signOut({ scope: "local" })`를 정확히 1회 부르고 303 Location이 기존과 같음. E2 demo access 실패 정리가 `{ scope: "local" }`.
2. 두 라우트의 `signOut()`을 `signOut({ scope: "local" })`로 바꾼다. 다른 동작은 바꾸지 않는다.

## Acceptance Criteria
```bash
npx vitest run <추가·수정한 테스트 경로>
npm run lint && npm run build && npm run test
```

## 검증 절차
결과를 `docs/verification/50-web-signout-scope/step0.md`에 기록(red→green·통과 수). index.json step 0 갱신.

## 금지사항
- `scope: "global"`·"모든 기기 로그아웃" UI를 추가하지 마라. 이유: ADR-089 범위 밖.
- service role을 쓰지 마라. 훅 우회 금지. 커밋·푸시 금지(root가 한다).
